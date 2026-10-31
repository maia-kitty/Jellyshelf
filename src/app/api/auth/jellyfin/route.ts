import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, handle } from "@/lib/api";
import { currentUser, getSession, isFirstUser, sealJellyfinToken } from "@/lib/auth";
import { deviceIdFor, jellyfin } from "@/lib/clients/jellyfin";
import { HttpError } from "@/lib/clients/http";
import { getSettings } from "@/lib/settings";
import { forgive, hit } from "@/lib/rateLimit";

const LOGIN_WINDOW = 15 * 60_000;

const body = z.object({ username: z.string().min(1), password: z.string() });

/**
 * Sign in with Jellyfin: every account is a Jellyfin account. Also used while signed in, to refresh the token playback
 * runs on, or to give a leftover AniList-only account (from before they were dropped) its Jellyfin account.
 */
export function POST(req: Request) {
  return handle(async () => {
    // A missing length means a chunked body, which a browser never sends here.
    if (Number(req.headers.get("content-length") ?? Infinity) > 4096) throw new ApiError(413, "Too long");
    // The client address is only as honest as X-Forwarded-For (Next fills it in when absent, but a caller can set
    // it), so the global cap is the real backstop against guessing; the per-address one keeps one typo-er from
    // using it all up.
    const ip = `login:${req.headers.get("x-forwarded-for") ?? "?"}`;
    const wait = Math.max(hit(ip, 10, LOGIN_WINDOW), hit("login:*", 60, LOGIN_WINDOW));
    if (wait) {
      return NextResponse.json(
        { error: `Too many sign-in attempts. Try again in ${Math.ceil(wait / 60_000)} min.` },
        { status: 429, headers: { "Retry-After": String(Math.ceil(wait / 1000)) } },
      );
    }
    const { username, password } = body.parse(await req.json());
    const s = await getSettings();
    if (!s.jellyfin.url) throw new ApiError(400, "Jellyfin isn't set up yet");
    const deviceId = deviceIdFor(username);
    let auth;
    try {
      auth = await jellyfin(s.jellyfin).authenticate(username, password, deviceId);
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) throw new ApiError(401, "Wrong username or password");
      // Don't show signed-out visitors Jellyfin's address or error text.
      console.error(e);
      throw new ApiError(502, "Couldn't reach Jellyfin. Try again in a bit.");
    }
    forgive(ip);
    const token = sealJellyfinToken({ token: auth.AccessToken, deviceId });
    const [existing] = await db.select().from(schema.users).where(eq(schema.users.jellyfinUserId, auth.User.Id));
    const me = await currentUser();

    if (me && !existing && !me.jellyfinUserId) {
      // A leftover AniList-only session: it becomes this Jellyfin account, keeping its ratings and requests.
      await db.update(schema.users).set({ jellyfinUserId: auth.User.Id, jellyfinToken: token, updatedAt: new Date() }).where(eq(schema.users.id, me.id));
      return { ok: true, redirect: "/" };
    }
    if (me && existing && existing.id !== me.id) throw new ApiError(409, "That Jellyfin account belongs to another Jellyshelf account");
    if (me && me.jellyfinUserId && me.jellyfinUserId !== auth.User.Id) throw new ApiError(409, "You're signed in with a different Jellyfin account");

    const first = await isFirstUser();
    const user = existing
      ? (await db.update(schema.users).set({ jellyfinToken: token, updatedAt: new Date() }).where(eq(schema.users.id, existing.id)).returning())[0]
      : (
          await db
            .insert(schema.users)
            .values({
              displayName: auth.User.Name,
              jellyfinUserId: auth.User.Id,
              jellyfinToken: token,
              role: first || auth.User.Policy.IsAdministrator ? "admin" : "user",
              autoApproveMovie: first || s.general.defaultAutoApprove,
              autoApproveTv: first || s.general.defaultAutoApprove,
              autoApproveAnime: first || s.general.defaultAutoApprove,
              autoApproveManga: first || s.general.defaultAutoApprove,
            })
            .returning()
        )[0];
    const session = await getSession();
    session.userId = user.id;
    await session.save();
    return { ok: true, redirect: s.general.setupComplete ? "/" : "/setup" };
  });
}
