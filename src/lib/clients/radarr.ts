import { arrApi, type ArrConfig } from "./arr";

export interface RadarrMovie {
  id?: number;
  title: string;
  tmdbId: number;
  year: number;
  monitored: boolean;
  hasFile?: boolean;
  isAvailable?: boolean;
  qualityProfileId?: number;
  rootFolderPath?: string;
  minimumAvailability?: string;
  addOptions?: { searchForMovie: boolean };
  [k: string]: unknown;
}

export function radarr(cfg: ArrConfig) {
  const api = arrApi(cfg);
  return {
    ...api,
    allMovies: () => api.call<RadarrMovie[]>("/movie", { timeoutMs: 60_000 }),
    movieByTmdb: async (tmdbId: number) => (await api.call<RadarrMovie[]>(`/movie?tmdbId=${tmdbId}`))[0] ?? null,
    lookupTmdb: (tmdbId: number) => api.call<RadarrMovie>(`/movie/lookup/tmdb?tmdbId=${tmdbId}`),
    addMovie: (m: RadarrMovie) => api.call<RadarrMovie>("/movie", { method: "POST", body: m }),
    updateMovie: (m: RadarrMovie) => api.call<RadarrMovie>(`/movie/${m.id}`, { method: "PUT", body: m }),
    movieSearch: (movieIds: number[]) => api.command({ name: "MoviesSearch", movieIds }),
  };
}
export type RadarrClient = ReturnType<typeof radarr>;
