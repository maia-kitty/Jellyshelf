import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
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
