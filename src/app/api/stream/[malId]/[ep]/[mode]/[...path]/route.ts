import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { rewritePlaylist, STREAM_HEADERS, zokoStream } from "@/lib/clients/zoko";
import { appSecret } from "@/lib/secret";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ malId: string; ep: string; mode: string; path: string[] }> };

const sign = (url: string) => crypto.createHmac("sha256", appSecret()).update(`stream:${url}`).digest("base64url").slice(0, 22);

/**
 * The browser's way to a /watch/anime stream, which the host only serves to its own embed (see STREAM_HEADERS):
 * `master.m3u8` and `subs.vtt` for the episode, and `u/<url>.<signature>` for everything the playlists link to. They're
 * rewritten to point back here, signed, so this only ever fetches what a stream's own playlists asked for.
 */
export async function GET(req: Request, { params }: Ctx) {
  if (!(await currentUser())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { malId, ep, mode, path } = await params;
  if (mode !== "sub" && mode !== "dub") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const base = `/api/stream/${malId}/${ep}/${mode}`;

  let url: string | null;
  if (path[0] === "u") {
    const [enc, sig] = (path[1] ?? "").split(".");
    url = Buffer.from(enc, "base64url").toString();
    if (!sig || sig !== sign(url)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  } else {
    const stream = await zokoStream(Number(malId), Number(ep), mode);
    url = path[0] === "subs.vtt" ? (stream?.subtitles ?? null) : (stream?.src ?? null);
    if (!url) return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Pass the viewer leaving (closing the page, seeking) through to the host.
  const upstream = await fetch(url, { headers: STREAM_HEADERS, signal: req.signal, cache: "no-store" }).catch((e) => {
    if ((e as Error).name === "AbortError") return null;
    throw e;
  });
  if (!upstream) return new Response(null, { status: 499 });
  const type = upstream.headers.get("content-type") ?? "application/octet-stream";
  const headers = { "content-type": type, "cache-control": "private, max-age=3600" };
  if (!upstream.ok || (!/mpegurl/i.test(type) && !new URL(url).pathname.endsWith(".m3u8"))) return new Response(upstream.body, { status: upstream.status, headers });
  const playlist = rewritePlaylist(await upstream.text(), url, (u) => `${base}/u/${Buffer.from(u).toString("base64url")}.${sign(u)}`);
  // Playlists aren't kept: how they point here may change (it did once), the video pieces they list don't.
  return new Response(playlist, { headers: { ...headers, "cache-control": "no-store" } });
}
