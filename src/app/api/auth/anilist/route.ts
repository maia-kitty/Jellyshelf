import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, handle } from "@/lib/api";
import { apiUser, getSession } from "@/lib/auth";
import { ANILIST_AUTHORIZE, anilistRedirectUri as redirectUri } from "@/lib/clients/anilist";
import { getSettings } from "@/lib/settings";

export async function GET() {
  const s = await getSettings();
  if (!s.anilist.clientId) return NextResponse.redirect(new URL("/login?error=anilist_not_configured", s.general.appUrl));
  const session = await getSession();
  session.oauthState = crypto.randomBytes(16).toString("hex");
  await session.save();
  const url = new URL(ANILIST_AUTHORIZE);
  url.searchParams.set("client_id", s.anilist.clientId);
  url.searchParams.set("redirect_uri", redirectUri(s.general.appUrl));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", session.oauthState);
  return NextResponse.redirect(url);
}

/**
 * Disconnect AniList from your account: Jellyshelf forgets the AniList user and its access. Your ratings stay. Only for
 * accounts that also sign in with Jellyfin; for one that signs in with AniList alone, it would be locked out for good.
 */
export function DELETE() {
  return handle(async () => {
    const user = await apiUser();
    if (!user.jellyfinUserId) throw new ApiError(400, "This account signs in with AniList, so it can't be disconnected.");
    await db
      .update(schema.users)
      .set({ anilistId: null, anilistToken: null, anilistTokenExpires: null, updatedAt: new Date() })
      .where(eq(schema.users.id, user.id));
  });
}
