import type { AnimeTarget } from "./mapping/resolve";

/** Minimal episode shape shared by Sonarr and Jellyfin data. */
export interface RawEpisode {
  season: number;
  episode: number;
  absolute: number | null;
}

/**
 * Pick the episodes belonging to one AniList entry and number them the way AniList does (1..N within the entry),
 * which is what list progress counts. `target === null` means plain TV: every regular season, numbered per season.
 */
export function scopeEpisodes<T extends RawEpisode>(eps: T[], target: Extract<AnimeTarget, { service: "sonarr" }> | null): (T & { n: number })[] {
  const inRange = (x: number, r: { from: number; to: number | null }) => x >= r.from && (r.to === null || x <= r.to);
  let out: (T & { n: number })[];
  if (!target) {
    out = eps.filter((e) => e.season > 0).map((e) => ({ ...e, n: e.episode }));
  } else if (target.absolute) {
    const r = target.episodes;
    out = eps
      .filter((e) => e.season > 0 && e.absolute !== null && (!r || inRange(e.absolute, r)))
      .map((e) => ({ ...e, n: r ? e.absolute! - r.from + 1 : e.absolute! }));
  } else {
    const r = target.episodes;
    out = eps
      .filter((e) => e.season === target.season && (!r || inRange(e.episode, r)))
      .map((e) => ({ ...e, n: r ? e.episode - r.from + 1 : e.episode }));
  }
  return out.sort((a, b) => a.season - b.season || a.episode - b.episode);
}

/** Picked episode numbers as runs of consecutive ones, which is how they can be requested: [1, 2, 3, 7] → 1–3 and 7. */
export function episodeRuns(eps: number[]): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  for (const n of [...eps].sort((a, b) => a - b)) {
    const last = out.at(-1);
    if (last && n === last.to + 1) last.to = n;
    else out.push({ from: n, to: n });
  }
  return out;
}
