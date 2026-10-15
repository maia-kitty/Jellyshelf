import { NextResponse } from "next/server";
import { currentUser, jellyfinToken } from "@/lib/auth";
import { authHeader } from "@/lib/clients/jellyfin";
import { joinUrl } from "@/lib/clients/http";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path: string[] }> };

/**
 * The browser's way to Jellyfin for media: video streams (direct and HLS), subtitles, font attachments, trickplay
 * and artwork. Requests go out as the signed-in user, so Jellyfin applies their library access; only media paths are
 * relayed, not the rest of the API.
 */
const ALLOWED = [
  /^Videos\/[0-9a-f-]{32,36}\//i, // stream, HLS playlists and segments, subtitles, attachments, trickplay
  /^Items\/[0-9a-f-]{32,36}\/Images\//i,
];

const PASS_UP = ["range", "if-range", "if-none-match", "if-modified-since", "accept"];
const PASS_DOWN = ["content-type", "content-length", "content-range", "accept-ranges", "cache-control", "etag", "last-modified", "content-disposition"];

async function relay(req: Request, { params }: Ctx) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const creds = jellyfinToken(user);
  if (!creds) return NextResponse.json({ error: "Sign in with Jellyfin again to watch" }, { status: 401 });
  const path = (await params).path.map(encodeURIComponent).join("/");
  if (!ALLOWED.some((re) => re.test(path))) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const { jellyfin: jf } = await getSettings();
  const url = joinUrl(jf.url, `/${path}`) + new URL(req.url).search;
  const headers = new Headers({ Authorization: authHeader(creds.token, creds.deviceId) });
  for (const h of PASS_UP) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  // Pass the viewer hanging up (closing the player, seeking) through to Jellyfin.
  const upstream = await fetch(url, { method: req.method, headers, signal: req.signal, cache: "no-store", redirect: "follow" }).catch((e) => {
    if ((e as Error).name === "AbortError") return null;
    throw e;
  });
  if (!upstream) return new Response(null, { status: 499 });

  const out = new Headers();
  for (const h of PASS_DOWN) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  if (!out.has("cache-control")) out.set("cache-control", path.startsWith("Items/") ? "private, max-age=86400" : "private, no-store");
  return new Response(req.method === "HEAD" ? null : upstream.body, { status: upstream.status, headers: out });
}

export { relay as GET, relay as HEAD };
