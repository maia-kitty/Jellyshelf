import type { AniTitle } from "./clients/anilist";

const SUFFIX = /\s*[-:]?\s*(s\d+|season\s*\d+|part\s*\d+|cour\s*\d+)\s*$/i;
const norm = (t: string) =>
  t
    .normalize("NFKD")
    // Drop the accents NFKD splits off; left in, "Pokémon" would become "pokem on" and miss a typed "Pokemon".
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bb`]/g, "'")
    .replace(/[^\p{L}\p{N}']+/gu, " ")
    .trim();

export type ListEntries = Map<number, { mediaId: number; score: number; media: { title: AniTitle } }>;

/**
 * Best-effort AniList match for a hand-typed title.
 * 1. The user's own list: these ratings were pushed there, so an entry whose title matches and whose
 *    score equals the rubric total is almost certainly it. No extra API calls.
 * 2. AniList search (rate-limited), retrying without "S1" / "season 2" style suffixes it can't handle.
 */
export async function matchTitle(
  title: string,
  total: number,
  list: ListEntries | null,
  search: (q: string) => Promise<number | null>,
): Promise<number | null> {
  if (list) {
    const wanted = [norm(title), norm(title.replace(SUFFIX, ""))].filter(Boolean);
    const hits = [...list.values()].filter((e) => {
      const names = [e.media.title.english, e.media.title.romaji, e.media.title.userPreferred, e.media.title.native]
        .filter((n): n is string => !!n)
        .map(norm);
      return names.some((n) => wanted.some((w) => n === w || n.startsWith(`${w} `)));
    });
    const best = hits.find((h) => h.score === total) ?? (hits.length === 1 ? hits[0] : undefined);
    if (best) return best.mediaId;
  }
  const hit = await search(title);
  if (hit) return hit;
  const stripped = title.replace(SUFFIX, "").trim();
  return stripped && stripped !== title ? search(stripped) : null;
}
