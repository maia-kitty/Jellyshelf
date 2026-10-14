import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { encrypt, getSession, isFirstUser } from "@/lib/auth";
import { ANILIST_TOKEN, anilist, anilistRedirectUri as redirectUri } from "@/lib/clients/anilist";
import { fetchJson } from "@/lib/clients/http";
import { getSettings } from "@/lib/settings";

export async function GET(req: NextRequest) {
  const s = await getSettings();
  const fail = (code: string) => NextResponse.redirect(new URL(`/login?error=${code}`, s.general.appUrl));
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const session = await getSession();
  if (!code || !state || state !== session.oauthState) return fail("oauth_state");
  session.oauthState = undefined;

  let token: { access_token: string; expires_in: number };
  try {
    token = await fetchJson(ANILIST_TOKEN, {
      method: "POST",
      body: {
        grant_type: "authorization_code",
        client_id: s.anilist.clientId,
        client_secret: s.anilist.clientSecret,
        redirect_uri: redirectUri(s.general.appUrl),
        code,
      },
    });
  } catch (e) {
    console.error("[auth] AniList token exchange failed:", e);
    return fail("oauth_exchange");
  }
  const viewer = await anilist.viewer(token.access_token);
  const first = await isFirstUser();
  const values = {
    displayName: viewer.name,
    avatar: viewer.avatar.large,
    anilistId: viewer.id,
    anilistToken: encrypt(token.access_token),
    anilistTokenExpires: new Date(Date.now() + token.expires_in * 1000),
    updatedAt: new Date(),
  };

  // Linking AniList to an already signed-in (e.g. Jellyfin) account.
  let userId = session.userId;
  if (userId) {
    const [taken] = await db.select().from(schema.users).where(eq(schema.users.anilistId, viewer.id));
    if (taken && taken.id !== userId) return fail("anilist_already_linked");
    await db.update(schema.users).set(values).where(eq(schema.users.id, userId));
  } else {
    const [row] = await db
      .insert(schema.users)
      .values({
        ...values,
        role: first ? "admin" : "user",
        autoApproveAnime: first || s.general.defaultAutoApprove,
        autoApproveMovie: first || s.general.defaultAutoApprove,
        autoApproveTv: first || s.general.defaultAutoApprove,
      })
      .onConflictDoUpdate({ target: schema.users.anilistId, set: values })
      .returning();
    userId = row.id;
  }
  session.userId = userId;
  await session.save();
  return NextResponse.redirect(new URL(s.general.setupComplete ? "/" : "/setup", s.general.appUrl));
}
