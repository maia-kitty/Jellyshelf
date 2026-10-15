import { fetchJson, joinUrl } from "./http";

export interface BazarrConfig {
  url: string;
  apiKey: string;
}

export interface BazarrSub {
  name: string;
  code2: string;
  code3: string;
  forced: boolean;
  hi: boolean;
  /** Present on subtitles that exist; null path means embedded in the video. */
  path?: string | null;
}

export interface BazarrEpisode {
  sonarrSeriesId: number;
  sonarrEpisodeId: number;
  season: number;
  episode: number;
  subtitles: BazarrSub[];
  missing_subtitles: BazarrSub[];
}

export interface BazarrMovie {
  radarrId: number;
  subtitles: BazarrSub[];
  missing_subtitles: BazarrSub[];
}

/** One result of a manual search. Bazarr sends its booleans as "True"/"False". */
export interface BazarrCandidate {
  provider: string;
  /** Opaque id Bazarr hands back to download this one. */
  subtitle: string;
  language: string;
  hearing_impaired: string;
  forced: string;
  original_format: string;
  score: number;
  release_info: string[];
  matches: string[];
  dont_matches: string[];
  uploader?: string;
  url?: string;
}

export type BazarrKind = "series" | "movie";

/** Bazarr's API (v1.x). It identifies everything by Sonarr series/episode ids and Radarr movie ids. */
export function bazarr(cfg: BazarrConfig) {
  if (!cfg.url || !cfg.apiKey) throw new Error("Bazarr is not configured");
  const call = <T>(path: string, init: { method?: string; timeoutMs?: number } = {}) =>
    fetchJson<T>(joinUrl(cfg.url, `/api${path}`), { ...init, headers: { "X-API-KEY": cfg.apiKey } });
  const qs = (o: Record<string, string | number>) => new URLSearchParams(Object.entries(o).map(([k, v]) => [k, String(v)])).toString();
  return {
    status: async () => (await call<{ data: { bazarr_version: string } }>("/system/status")).data,
    episodes: async (seriesId: number) => (await call<{ data: BazarrEpisode[] }>(`/episodes?seriesid[]=${seriesId}`)).data,
    movie: async (radarrId: number) => (await call<{ data: BazarrMovie[] }>(`/movies?radarrid[]=${radarrId}`)).data[0] ?? null,
    /** Queue Bazarr's own search for everything missing on a series or movie. */
    searchMissing: (kind: BazarrKind, id: number) =>
      call<void>(kind === "series" ? `/series?${qs({ seriesid: id, action: "search-missing" })}` : `/movies?${qs({ radarrid: id, action: "search-missing" })}`, {
        method: "PATCH",
        timeoutMs: 60_000,
      }),
    /** Manual search; asks every enabled provider, so it can take a while. `id` is the episode or Radarr movie id. */
    candidates: async (kind: BazarrKind, id: number) =>
      (
        await call<{ data: BazarrCandidate[] }>(kind === "series" ? `/providers/episodes?episodeid=${id}` : `/providers/movies?radarrid=${id}`, {
          timeoutMs: 120_000,
        })
      ).data,
    /** Download one manual-search result. Bazarr queues it and returns straight away. */
    download: (kind: BazarrKind, ids: { seriesId?: number; id: number }, c: Pick<BazarrCandidate, "provider" | "subtitle" | "hearing_impaired" | "forced" | "original_format">) => {
      const common = { provider: c.provider, subtitle: c.subtitle, hi: c.hearing_impaired, forced: c.forced, original_format: c.original_format };
      return call<void>(
        kind === "series"
          ? `/providers/episodes?${qs({ seriesid: ids.seriesId!, episodeid: ids.id, ...common })}`
          : `/providers/movies?${qs({ radarrid: ids.id, ...common })}`,
        { method: "POST", timeoutMs: 60_000 },
      );
    },
  };
}
