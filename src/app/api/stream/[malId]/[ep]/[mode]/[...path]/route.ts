import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { STREAM_HEADERS, zokoStream } from "@/lib/clients/zoko";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ malId: string; ep: string; mode: string; path: string[] }> };

/**
 * The browser's way to a /watch/anime stream: its playlists and subtitles, which the host only serves with the
 * embed's Referer. Paths mirror the stream's own folder, so the master playlist's relative variant links land back
 * here. The video segments are absolute links the browser fetches from the host itself.
 */
export async function GET(_req: Request, { params }: Ctx) {
  if (!(await currentUser())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { malId, ep, mode, path } = await params;
  if (mode !== "sub" && mode !== "dub") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const stream = await zokoStream(Number(malId), Number(ep), mode);
  if (!stream) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const file = path.map(encodeURIComponent).join("/");
  const folder = stream.src.slice(0, stream.src.lastIndexOf("/") + 1);
  const url = file === "subs.vtt" ? stream.subtitles : new URL(file, folder).href;
  // Only that stream's folder: this isn't a way to fetch anything else through the server.
  if (!url || (file !== "subs.vtt" && !url.startsWith(folder))) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const upstream = await fetch(url, { headers: STREAM_HEADERS, cache: "no-store" });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/octet-stream", "cache-control": "private, max-age=3600" },
  });
}
