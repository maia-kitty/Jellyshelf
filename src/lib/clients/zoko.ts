import { cached } from "../cache";
import { HttpError } from "./http";

/**
 * Anime streams from ZokoAnime, the embed ani-cli plays (github.com/pystardust/ani-cli, `hianime_m3u8`). Its page for
 * a MAL id + episode carries the stream's config. When this stops working, see how ani-cli does it now.
 */
const EMBED = "https://zokoanime.video";
export const STREAM_HEADERS = {
  // The stream host answers 403 to anyone not coming from the embed.
  Referer: `${EMBED}/`,
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};
const KEY = Buffer.from("otaku-embed-v1");

export type StreamMode = "sub" | "dub";
export interface Stream {
  /** The master playlist. */
  src: string;
  subtitles: string | null;
}

/** The embed ships its config as base64(json XOR "otaku-embed-v1"). */
export function deobfuscate(blob: string): unknown {
  const bytes = Buffer.from(blob, "base64");
  return JSON.parse(Buffer.from(bytes.map((b, i) => b ^ KEY[i % KEY.length])).toString("utf8"));
}

/** One episode's stream, or null when the site doesn't have it. */
export function zokoStream(malId: number, ep: number, mode: StreamMode): Promise<Stream | null> {
  return cached(`zoko:${malId}:${ep}:${mode}`, 3600, async () => {
    const url = `${EMBED}/stream/mal/${malId}/${ep}/${mode}`;
    const res = await fetch(url, { headers: STREAM_HEADERS, signal: AbortSignal.timeout(10_000) });
    if (res.status === 404) return null;
    const html = await res.text();
    if (!res.ok) throw new HttpError(res.status, url, html);
    // A missing episode is still a 200, just without the config.
    const blob = html.match(/window\.__P="([^"]*)"/)?.[1];
    if (!blob) return null;
    const cfg = deobfuscate(blob) as { src?: string; subtitles?: { src: string; default?: boolean }[] };
    if (!cfg.src) return null;
    const subs = cfg.subtitles ?? [];
    return { src: cfg.src, subtitles: (subs.find((s) => s.default) ?? subs[0])?.src ?? null };
  });
}
