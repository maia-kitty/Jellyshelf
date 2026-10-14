import type { IdMapping } from "@/db/schema";
import type { AniFormat } from "@/lib/clients/anilist";

export interface EpisodeRange {
  from: number;
  /** null = open-ended (still airing / unknown length). */
  to: number | null;
}

export type AnimeTarget =
  | { service: "radarr"; tmdbId: number }
  | {
      service: "sonarr";
      tvdbId: number;
      /** TVDB season number; absent for absolute-numbered shows. */
      season: number | null;
      /** null = take the whole season (or whole series when absolute). */
      episodes: EpisodeRange | null;
      absolute: boolean;
    }
  | { service: "unmapped"; reason: string };

export interface AniEntryInfo {
  id: number;
  format: AniFormat | null;
  episodes: number | null;
}

type MappingLike = Pick<IdMapping, "anilistId" | "tvdbId" | "tmdbMovieId" | "tvdbSeason" | "episodeOffset">;

/**
 * Decide where an AniList entry goes.
 * @param mapping  id_mapping row (or override) for this entry; undefined if unknown.
 * @param siblings other mappings pointing at the same TVDB series — used to tell whether a
 *                 TVDB season is shared between several AniList entries (split cours, "Part 2").
 */
export function resolveAnimeTarget(entry: AniEntryInfo, mapping: MappingLike | undefined, siblings: MappingLike[] = []): AnimeTarget {
  if (!mapping) return { service: "unmapped", reason: "No ID mapping for this AniList entry" };

  if (entry.format === "MOVIE") {
    if (mapping.tmdbMovieId) return { service: "radarr", tmdbId: mapping.tmdbMovieId };
    if (!mapping.tvdbId) return { service: "unmapped", reason: "Movie has no TMDB id" };
    // Some movies are filed under a TVDB series (usually as specials); fall through to Sonarr.
  }

  if (!mapping.tvdbId) {
    if (mapping.tmdbMovieId) return { service: "radarr", tmdbId: mapping.tmdbMovieId };
    return { service: "unmapped", reason: "No TVDB id for this AniList entry" };
  }

  const season = mapping.tvdbSeason;
  const offset = mapping.episodeOffset ?? 0;
  const range = (): EpisodeRange => ({ from: offset + 1, to: entry.episodes ? offset + entry.episodes : null });

  if (season === -1) {
    const shared = siblings.some((s) => s.anilistId !== entry.id && s.tvdbSeason === -1);
    return {
      service: "sonarr",
      tvdbId: mapping.tvdbId,
      season: null,
      absolute: true,
      episodes: shared || offset > 0 ? range() : null,
    };
  }

  if (season === null) {
    return { service: "unmapped", reason: "TVDB season for this entry is unknown" };
  }

  // A season is "shared" if another AniList entry maps into the same TVDB season.
  const shared = siblings.some((s) => s.anilistId !== entry.id && s.tvdbSeason === season);
  const episodes = offset > 0 || shared ? range() : null;
  return { service: "sonarr", tvdbId: mapping.tvdbId, season, absolute: false, episodes };
}

export function describeTarget(t: AnimeTarget): string {
  switch (t.service) {
    case "radarr":
      return `Radarr (TMDB ${t.tmdbId})`;
    case "unmapped":
      return t.reason;
    case "sonarr": {
      const eps = t.episodes ? ` episodes ${t.episodes.from}–${t.episodes.to ?? "…"}` : "";
      if (t.absolute) return `Sonarr TVDB ${t.tvdbId}, absolute${eps || " (whole series)"}`;
      return `Sonarr TVDB ${t.tvdbId}, ${t.season === 0 ? "specials" : `season ${t.season}`}${eps}`;
    }
  }
}
