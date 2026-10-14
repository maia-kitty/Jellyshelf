import { XMLParser } from "fast-xml-parser";
import type { IdMapping } from "@/db/schema";

export const FRIBB_URL = "https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-full.json";
export const ANIME_LISTS_URL = "https://raw.githubusercontent.com/Anime-Lists/anime-lists/master/anime-list.xml";

export interface FribbEntry {
  type?: string;
  anidb_id?: number;
  anilist_id?: number;
  mal_id?: number;
  tvdb_id?: number;
  imdb_id?: string[] | string;
  themoviedb_id?: { tv?: number; movie?: number[] | number };
  season?: { tvdb?: number; tmdb?: number };
}

export interface AnimeListsEntry {
  /** -1 = absolute numbering ("a"); null when the entry isn't a TVDB series (e.g. "movie"). */
  season: number | null;
  offset: number;
  tvdbId: number | null;
}

/** Parse Anime-Lists' anime-list.xml into anidb id → TVDB season/offset. */
export function parseAnimeListsXml(xml: string): Map<number, AnimeListsEntry> {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", isArray: (name) => name === "anime" });
  const doc = parser.parse(xml) as { "anime-list": { anime: Record<string, string>[] } };
  const out = new Map<number, AnimeListsEntry>();
  for (const a of doc["anime-list"].anime) {
    const anidb = Number(a.anidbid);
    if (!anidb) continue;
    const tvdbId = /^\d+$/.test(a.tvdbid ?? "") ? Number(a.tvdbid) : null;
    const raw = a.defaulttvdbseason;
    const season = raw === "a" ? -1 : raw !== undefined && /^\d+$/.test(raw) ? Number(raw) : null;
    out.set(anidb, { season: tvdbId ? season : null, offset: Number(a.episodeoffset ?? 0) || 0, tvdbId });
  }
  return out;
}

const first = <T>(v: T | T[] | undefined): T | undefined => (Array.isArray(v) ? v[0] : v);

/** Merge Fribb's cross-id list with Anime-Lists season data into id_mapping rows. */
export function buildMappingRows(fribb: FribbEntry[], animeLists: Map<number, AnimeListsEntry>): IdMapping[] {
  const rows: IdMapping[] = [];
  for (const f of fribb) {
    if (!f.anilist_id) continue;
    const al = f.anidb_id ? animeLists.get(f.anidb_id) : undefined;
    const tvdbId = f.tvdb_id ?? al?.tvdbId ?? null;
    // Anime-Lists is the authority on TVDB seasons (and knows about absolute numbering); Fribb is the fallback.
    const tvdbSeason = al && al.tvdbId === tvdbId && al.season !== null ? al.season : (f.season?.tvdb ?? null);
    rows.push({
      anilistId: f.anilist_id,
      anidbId: f.anidb_id ?? null,
      malId: f.mal_id ?? null,
      tvdbId,
      tmdbMovieId: first(f.themoviedb_id?.movie) ?? null,
      tmdbTvId: f.themoviedb_id?.tv ?? null,
      imdbId: first(f.imdb_id) ?? null,
      type: f.type ?? null,
      tvdbSeason: tvdbId ? tvdbSeason : null,
      episodeOffset: al && al.tvdbId === tvdbId ? al.offset : 0,
    });
  }
  return rows;
}
