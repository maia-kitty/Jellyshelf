import { fetchJson, joinUrl } from "./http";

export interface MangarrConfig {
  url: string;
  apiKey: string;
}

/** A series as Mangarr's /api/v1/series returns it (only what Jellyshelf uses). */
export interface MangarrSeries {
  anilistId: number;
  title: string;
  cover: string | null;
  monitored: boolean;
  startChapter: number;
  sourceName: string | null;
  /** ok | no_match | error | matching */
  state: string;
  error: string | null;
  anilistStatus: string | null;
  chaptersOnDisk: number;
  chaptersMissing: number;
  latestChapter: number | null;
}

export interface MangarrChapter {
  number: number;
  name: string | null;
  onDisk: boolean;
  imported: number | null;
}

export function mangarr(cfg: MangarrConfig) {
  if (!cfg.url) throw new Error("Mangarr is not configured");
  const call = <T>(path: string, init: { method?: string; body?: unknown; timeoutMs?: number } = {}) =>
    fetchJson<T>(joinUrl(cfg.url, `/api/v1${path}`), { ...init, headers: cfg.apiKey ? { "X-Api-Key": cfg.apiKey } : {} });
  return {
    call,
    status: () => call<{ version: string; suwayomi: { ok: boolean } }>("/status"),
    allSeries: () => call<MangarrSeries[]>("/series", { timeoutMs: 15_000 }),
    series: (anilistId: number) => call<MangarrSeries>(`/series/${anilistId}`),
    add: (anilistId: number, startChapter: number) => call<MangarrSeries>("/series", { method: "POST", body: { anilistId, startChapter } }),
    update: (anilistId: number, patch: { monitored?: boolean; startChapter?: number }) =>
      call<MangarrSeries>(`/series/${anilistId}`, { method: "PATCH", body: patch }),
    remove: (anilistId: number, deleteFiles: boolean) => call(`/series/${anilistId}?deleteFiles=${deleteFiles}`, { method: "DELETE", timeoutMs: 60_000 }),
    chapters: (anilistId: number) => call<MangarrChapter[]>(`/series/${anilistId}/chapters`),
    pageCount: (anilistId: number, chapter: number) =>
      call<{ count: number }>(`/series/${anilistId}/chapters/${chapter}/pages`, { timeoutMs: 60_000 }).then((r) => r.count),
    /** The raw image response, to stream on to the browser. */
    page: (anilistId: number, chapter: number, page: number) =>
      fetch(joinUrl(cfg.url, `/api/v1/series/${anilistId}/chapters/${chapter}/pages/${page}`), {
        headers: cfg.apiKey ? { "X-Api-Key": cfg.apiKey } : {},
        signal: AbortSignal.timeout(60_000),
        cache: "no-store",
      }),
  };
}
