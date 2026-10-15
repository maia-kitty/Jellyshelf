import { arrApi, type ArrConfig, type ArrFile } from "./arr";
import { HttpError } from "./http";

export interface SonarrSeasonStats {
  episodeFileCount: number;
  episodeCount: number;
  totalEpisodeCount: number;
  percentOfEpisodes: number;
}

export interface SonarrSeason {
  seasonNumber: number;
  monitored: boolean;
  statistics?: SonarrSeasonStats;
}

export interface SonarrSeries {
  id?: number;
  title: string;
  tvdbId: number;
  year?: number;
  seriesType: "standard" | "daily" | "anime";
  monitored: boolean;
  seasons: SonarrSeason[];
  qualityProfileId?: number;
  languageProfileId?: number;
  rootFolderPath?: string;
  path?: string;
  seasonFolder?: boolean;
  statistics?: SonarrSeasonStats & { seasonCount: number };
  addOptions?: {
    searchForMissingEpisodes?: boolean;
    monitor?: "all" | "future" | "missing" | "existing" | "firstSeason" | "latestSeason" | "pilot" | "none";
  };
  [k: string]: unknown;
}

export interface SonarrEpisode {
  id: number;
  seriesId: number;
  seasonNumber: number;
  episodeNumber: number;
  absoluteEpisodeNumber?: number;
  monitored: boolean;
  hasFile: boolean;
  title: string;
  airDateUtc?: string;
  /** Present when requested with includeEpisodeFile=true. */
  episodeFile?: ArrFile;
}

export function sonarr(cfg: ArrConfig) {
  const api = arrApi(cfg);
  return {
    ...api,
    /** v4 removed language profiles; returns [] there. */
    languageProfiles: async () => {
      try {
        return await api.call<{ id: number; name: string }[]>("/languageprofile");
      } catch (e) {
        if (e instanceof HttpError && (e.status === 404 || e.status === 405)) return [];
        throw e;
      }
    },
    allSeries: () => api.call<SonarrSeries[]>("/series", { timeoutMs: 60_000 }),
    seriesByTvdb: async (tvdbId: number) => (await api.call<SonarrSeries[]>(`/series?tvdbId=${tvdbId}`))[0] ?? null,
    series: (id: number) => api.call<SonarrSeries>(`/series/${id}`),
    lookup: (term: string) => api.call<SonarrSeries[]>(`/series/lookup?term=${encodeURIComponent(term)}`),
    lookupTvdb: async (tvdbId: number) => (await api.call<SonarrSeries[]>(`/series/lookup?term=tvdb:${tvdbId}`))[0] ?? null,
    addSeries: (s: SonarrSeries) => api.call<SonarrSeries>("/series", { method: "POST", body: s }),
    updateSeries: (s: SonarrSeries) => api.call<SonarrSeries>(`/series/${s.id}`, { method: "PUT", body: s }),
    episodes: (seriesId: number, withFiles = false) =>
      api.call<SonarrEpisode[]>(`/episode?seriesId=${seriesId}${withFiles ? "&includeEpisodeFile=true" : ""}`),
    monitorEpisodes: (episodeIds: number[], monitored = true) =>
      api.call<unknown>("/episode/monitor", { method: "PUT", body: { episodeIds, monitored } }),
    seasonSearch: (seriesId: number, seasonNumber: number) => api.command({ name: "SeasonSearch", seriesId, seasonNumber }),
    episodeSearch: (episodeIds: number[]) => api.command({ name: "EpisodeSearch", episodeIds }),
  };
}
export type SonarrClient = ReturnType<typeof sonarr>;
