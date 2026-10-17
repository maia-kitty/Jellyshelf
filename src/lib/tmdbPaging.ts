import type { TmdbPage } from "./clients/tmdb";

/** TMDB serves its lists 20 to a page, and won't go past page 500. */
const PER = 20;
const LAST = 500;

/**
 * Page `page` of a TMDB list, `size` results to a page instead of TMDB's 20, so a grid can show a count that fills its
 * rows. Fetches whichever TMDB pages that window spans, plus one spare.
 */
export async function tmdbPaged<T extends { id: number }>(fetch: (page: number) => Promise<TmdbPage<T>>, page: number, size: number) {
  const start = (page - 1) * size;
  const first = Math.floor(start / PER) + 1;
  // One spare page: lists shift between requests, so a title can turn up on two TMDB pages. It's shown once, and the
  // spare tops the page back up so the grid stays full.
  const last = Math.floor((start + size - 1) / PER) + 2;
  const head = await fetch(first);
  const end = Math.min(head.total_pages, LAST);
  const rest = await Promise.all(Array.from({ length: Math.min(last, end) - first }, (_, i) => fetch(first + 1 + i)));
  const seen = new Set<number>();
  const results = [head, ...rest]
    .flatMap((p) => p.results)
    .slice(start - (first - 1) * PER)
    .filter((r) => !seen.has(r.id) && !!seen.add(r.id))
    .slice(0, size);
  return { results, hasNext: start + size < Math.min(head.total_results, end * PER) };
}
