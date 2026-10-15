/**
 * Responsive image sources: give the browser a few widths of the same picture and let it take the smallest that's
 * still sharp on this screen (1× desktop, 2–3× phones), instead of one oversized file for everyone.
 *
 * - TMDB serves fixed sizes (w92…w1280), so we just list them.
 * - AniList's covers come at 230 px or as the original upload (often 400–700 KB), and banners only as originals; those
 *   go through Next's image optimizer, which resizes once, re-encodes to WebP and caches on disk.
 * - Jellyfin images (through /api/jf) take a maxWidth.
 *
 * Plain function, safe on server and client. Spread the result onto an <img>.
 */
export interface Sized {
  src: string;
  srcSet?: string;
  sizes?: string;
}

const TMDB_POSTER = [92, 154, 185, 342, 500, 780];
const TMDB_BACKDROP = [300, 780, 1280];
// Must match images.imageSizes / deviceSizes in next.config.ts (the optimizer only serves those widths).
export const OPT_WIDTHS = [48, 96, 160, 240, 320, 480, 640, 960, 1280, 1920];

const ANILIST = /^https:\/\/s4\.anilist\.co\/file\/anilistcdn\/media\/anime\/(cover\/(?:large|medium|small)|banner)\//;
const TMDB = /^https:\/\/image\.tmdb\.org\/t\/p\/(w\d+|original)\//;

/** Widths worth offering for something displayed `w` CSS px wide: 1×, 2× and 3× screens. */
const wanted = (w: number) => [w, w * 2, w * 3];
const pick = (avail: number[], w: number) => [...new Set(wanted(w).map((x) => avail.find((a) => a >= x) ?? avail[avail.length - 1]))];

const optimized = (url: string, w: number, q = 72) => `/_next/image?url=${encodeURIComponent(url)}&w=${w}&q=${q}`;

/**
 * @param width how wide it's shown, in CSS px (for `sizes`; pass the largest it gets on any layout)
 * @param sizes override the `sizes` attribute, e.g. "100vw" for full-bleed banners
 */
export function sized(url: string | null | undefined, width: number, sizes?: string): Sized {
  if (!url) return { src: "" };
  const sizesAttr = sizes ?? `${width}px`;

  const tmdb = url.match(TMDB);
  if (tmdb) {
    const isBackdrop = width > 500 || sizes?.includes("vw");
    const avail = isBackdrop ? TMDB_BACKDROP : TMDB_POSTER;
    const ws = isBackdrop ? TMDB_BACKDROP.filter((a) => a >= Math.min(width, 780)) : pick(avail, width);
    const at = (w: number) => url.replace(TMDB, `https://image.tmdb.org/t/p/w${w}/`);
    return { src: at(ws[0]), srcSet: ws.map((w) => `${at(w)} ${w}w`).join(", "), sizes: sizesAttr };
  }

  const ani = url.match(ANILIST);
  if (ani) {
    // Covers: AniList's own 230 px file is plenty for small thumbnails (unless it's a PNG: those run 100-160 KB even
    // at that size); anything bigger is resized from the original.
    const small = url.replace(ANILIST, "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/");
    if (ani[1].startsWith("cover/") && width * 2 <= 230) {
      if (!/\.png$/i.test(url)) return { src: small };
      const ws = pick(OPT_WIDTHS, width);
      return { src: optimized(small, ws[0]), srcSet: ws.map((w) => `${optimized(small, w)} ${w}w`).join(", "), sizes: sizesAttr };
    }
    const original = ani[1].startsWith("cover/") ? url.replace(ANILIST, "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/") : url;
    const ws = sizes?.includes("vw") ? OPT_WIDTHS.filter((w) => w >= 640) : pick(OPT_WIDTHS, width);
    return { src: optimized(original, ws[0]), srcSet: ws.map((w) => `${optimized(original, w)} ${w}w`).join(", "), sizes: sizesAttr };
  }

  if (url.startsWith("/api/jf/") && /\/Images\//.test(url)) {
    const at = (w: number) => {
      const u = new URL(url, "http://x");
      u.searchParams.set("maxWidth", String(w));
      u.searchParams.set("quality", "85");
      return u.pathname + u.search;
    };
    const ws = sizes?.includes("vw") ? [960, 1920] : wanted(width).map((w) => Math.round(w / 40) * 40);
    return { src: at(ws[0]), srcSet: ws.map((w) => `${at(w)} ${w}w`).join(", "), sizes: sizesAttr };
  }

  return { src: url };
}
