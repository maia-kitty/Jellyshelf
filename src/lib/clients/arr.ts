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
    command: (body: Record<string, unknown>) => call<{ id: number }>("/command", { method: "POST", body }),
  };
}
