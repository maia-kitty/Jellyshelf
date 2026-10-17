import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { encrypt, getSession } from "@/lib/auth";
import { ANILIST_TOKEN, anilist, anilistRedirectUri as redirectUri } from "@/lib/clients/anilist";
import { fetchJson } from "@/lib/clients/http";
import { getSettings } from "@/lib/settings";
import { mergeAnilistAccount } from "@/lib/users";

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
  const link = {
    anilistId: viewer.id,
    anilistToken: encrypt(token.access_token),
    anilistTokenExpires: new Date(Date.now() + token.expires_in * 1000),
    updatedAt: new Date(),
  };
  const [owner] = await db.select().from(schema.users).where(eq(schema.users.anilistId, viewer.id));

  let userId = session.userId;
  const [me] = userId ? await db.select().from(schema.users).where(eq(schema.users.id, userId)) : [];
  if (me) {
    // Linking AniList as an add-on to the signed-in (Jellyfin) account. The Jellyfin name stays; the avatar fills a gap.
    const linkFields = { ...link, avatar: me.avatar ?? viewer.avatar.large };
    if (owner && owner.id !== me.id) {
      // A leftover AniList-only account for the same person gets folded in; one tied to another Jellyfin user is someone else's.
      if (owner.jellyfinUserId) return fail("anilist_already_linked");
      await mergeAnilistAccount(owner, me, linkFields);
    } else {
      await db.update(schema.users).set(linkFields).where(eq(schema.users.id, me.id));
    }
  } else if (owner?.jellyfinUserId) {
    // Signing in with an AniList account that's linked to a Jellyfin one.
    await db.update(schema.users).set({ ...link, avatar: owner.avatar ?? viewer.avatar.large }).where(eq(schema.users.id, owner.id));
    userId = owner.id;
  } else {
    // Accounts come from Jellyfin; AniList is linked to one afterwards. A leftover AniList-only account (from before
    // they were dropped) can't sign in either: linking this AniList from the Jellyfin account folds it in.
    return fail("anilist_needs_jellyfin");
  }
  session.userId = userId;
  await session.save();
  return NextResponse.redirect(new URL(s.general.setupComplete ? "/" : "/setup", s.general.appUrl));
}
