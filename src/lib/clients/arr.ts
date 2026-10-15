import { fetchJson, joinUrl } from "./http";

export interface ArrConfig {
  url: string;
  apiKey: string;
}

export interface QualityProfile {
  id: number;
  name: string;
}
export interface RootFolder {
  id: number;
  path: string;
  freeSpace?: number;
}

/** A file on disk as Sonarr/Radarr describe it (movieFile / episodeFile). */
export interface ArrFile {
  relativePath?: string;
  size: number;
  quality?: { quality?: { name: string; resolution?: number } };
  releaseGroup?: string | null;
  mediaInfo?: {
    /** "jpn/eng" */
    audioLanguages?: string;
    audioCodec?: string;
    audioChannels?: number;
    /** Embedded subtitle tracks, same format: "eng/jpn" */
    subtitles?: string;
    videoCodec?: string;
    videoDynamicRangeType?: string;
    resolution?: string;
  };
}

/** One item in a Sonarr/Radarr download queue. */
export interface QueueRecord {
  id: number;
  size: number;
  sizeleft: number;
  /** "hh:mm:ss" or "d.hh:mm:ss"; absent when the client can't estimate. */
  timeleft?: string;
  status: string; // downloading, queued, paused, delay, completed, failed, warning…
  trackedDownloadStatus?: "ok" | "warning" | "error";
  trackedDownloadState?: string; // downloading, importPending, importing, imported, failedPending…
  errorMessage?: string;
  statusMessages?: { title: string; messages: string[] }[];
  // Sonarr
  seriesId?: number;
  episode?: { seasonNumber: number; episodeNumber: number; absoluteEpisodeNumber?: number };
  // Radarr
  movieId?: number;
}

/** Shared bits of the Sonarr/Radarr v3 API. */
export function arrApi(cfg: ArrConfig) {
  if (!cfg.url || !cfg.apiKey) throw new Error("Service is not configured");
  const call = <T>(path: string, init: { method?: string; body?: unknown; timeoutMs?: number } = {}) =>
    fetchJson<T>(joinUrl(cfg.url, `/api/v3${path}`), { ...init, headers: { "X-Api-Key": cfg.apiKey } });
  return {
    call,
    status: () => call<{ version: string; appName?: string; instanceName?: string }>("/system/status"),
    qualityProfiles: () => call<QualityProfile[]>("/qualityprofile"),
    rootFolders: () => call<RootFolder[]>("/rootfolder"),
    /** The whole download queue (one page is plenty for a home server). */
    queue: async (extra = "") =>
      (await call<{ records: QueueRecord[] }>(`/queue?page=1&pageSize=500${extra}`, { timeoutMs: 15_000 })).records,
    command: (body: Record<string, unknown>) => call<{ id: number }>("/command", { method: "POST", body }),
  };
}
