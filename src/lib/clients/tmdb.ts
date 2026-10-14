import { fetchJson } from "./http";
import { getSetting } from "@/lib/settings";

const BASE = "https://api.themoviedb.org/3";
export const TMDB_IMG = "https://image.tmdb.org/t/p";

export interface TmdbMovie {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;
  vote_average: number;
  genre_ids?: number[];
  original_language: string;
}

export interface TmdbTv {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date?: string;
  vote_average: number;
  genre_ids?: number[];
  origin_country?: string[];
  original_language: string;
}

export interface TmdbMovieDetails extends TmdbMovie {
  runtime: number | null;
  genres: { id: number; name: string }[];
  status: string;
  tagline: string;
  external_ids?: { imdb_id: string | null };
}

export interface TmdbSeason {
  id: number;
  season_number: number;
  name: string;
  episode_count: number;
  air_date: string | null;
  poster_path: string | null;
}

export interface TmdbTvDetails extends TmdbTv {
  genres: { id: number; name: string }[];
  status: string;
  tagline: string;
  number_of_seasons: number;
  seasons: TmdbSeason[];
  external_ids?: { tvdb_id: number | null; imdb_id: string | null };
}

export interface TmdbPage<T> {
  page: number;
  total_pages: number;
  total_results: number;
  results: T[];
}

export type TmdbMultiResult =
  | (TmdbMovie & { media_type: "movie" })
  | (TmdbTv & { media_type: "tv" })
  | { media_type: "person"; id: number; name: string };

async function tmdb<T>(path: string, params: Record<string, string | number> = {}, revalidate = 3600): Promise<T> {
  const { apiKey } = await getSetting("tmdb");
  if (!apiKey) throw new Error("TMDB API key is not configured");
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  // v4 read-access tokens are JWTs; v3 keys are 32 hex chars.
  const isBearer = apiKey.length > 40;
  if (!isBearer) url.searchParams.set("api_key", apiKey);
  return fetchJson<T>(url.toString(), {
    revalidate,
    headers: isBearer ? { Authorization: `Bearer ${apiKey}` } : {},
  });
}

export const ANIMATION_GENRE = 16;

/** TMDB has no "anime" type; animation from Japan is the usual heuristic. */
export function looksLikeAnime(item: { genre_ids?: number[]; genres?: { id: number }[]; original_language: string; origin_country?: string[] }) {
  const genres = item.genre_ids ?? item.genres?.map((g) => g.id) ?? [];
  return genres.includes(ANIMATION_GENRE) && (item.original_language === "ja" || !!item.origin_country?.includes("JP"));
}

export const tmdbClient = {
  trendingMovies: (page = 1) => tmdb<TmdbPage<TmdbMovie>>("/trending/movie/week", { page }),
  popularMovies: (page = 1) => tmdb<TmdbPage<TmdbMovie>>("/movie/popular", { page }),
  upcomingMovies: (page = 1) => tmdb<TmdbPage<TmdbMovie>>("/movie/upcoming", { page }),
  trendingTv: (page = 1) => tmdb<TmdbPage<TmdbTv>>("/trending/tv/week", { page }),
  popularTv: (page = 1) => tmdb<TmdbPage<TmdbTv>>("/tv/popular", { page }),
  airingTv: (page = 1) => tmdb<TmdbPage<TmdbTv>>("/tv/on_the_air", { page }),
  movie: (id: number) => tmdb<TmdbMovieDetails>(`/movie/${id}`, { append_to_response: "external_ids" }),
  tv: (id: number) => tmdb<TmdbTvDetails>(`/tv/${id}`, { append_to_response: "external_ids" }),
  search: (query: string, page = 1) => tmdb<TmdbPage<TmdbMultiResult>>("/search/multi", { query, page }, 600),
  findByTvdb: (tvdbId: number) =>
    tmdb<{ tv_results: TmdbTv[] }>(`/find/${tvdbId}`, { external_source: "tvdb_id" }, 86400),
  /** Used by the setup wizard's test button. */
  ping: () => tmdb<unknown>("/configuration", {}, 0),
};

export function tmdbImage(path: string | null | undefined, size: "w342" | "w500" | "w780" | "original" = "w342") {
  return path ? `${TMDB_IMG}/${size}${path}` : null;
}
