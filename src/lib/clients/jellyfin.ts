import { fetchJson, joinUrl } from "./http";

const CLIENT = 'MediaBrowser Client="Jellyshelf", Device="Server", DeviceId="jellyshelf-server", Version="0.1.0"';

function authHeader(token: string | undefined) {
  return token ? `${CLIENT}, Token="${token}"` : CLIENT;
}

export interface JellyfinItem {
  Id: string;
  Name: string;
  Type: "Movie" | "Series" | "Season" | "Episode";
  ProductionYear?: number;
  ProviderIds?: Record<string, string>;
  Path?: string;
  IndexNumber?: number;
  ParentIndexNumber?: number;
  SeriesId?: string;
}

export function jellyfin(cfg: { url: string; apiKey: string }) {
  if (!cfg.url) throw new Error("Jellyfin is not configured");
  const call = <T>(path: string, init: { method?: string; body?: unknown; token?: string; timeoutMs?: number } = {}) =>
    fetchJson<T>(joinUrl(cfg.url, path), {
      method: init.method,
      body: init.body,
      timeoutMs: init.timeoutMs,
      headers: { Authorization: authHeader(init.token ?? cfg.apiKey) },
    });
  return {
    info: () => call<{ Id: string; ServerName: string; Version: string }>("/System/Info"),
    authenticate: (username: string, password: string) =>
      call<{ User: { Id: string; Name: string; Policy: { IsAdministrator: boolean } }; AccessToken: string }>(
        "/Users/AuthenticateByName",
        { method: "POST", body: { Username: username, Pw: password } },
      ),
    /** Every movie and series in the library with provider ids. */
    libraryItems: async () => {
      const res = await call<{ Items: JellyfinItem[] }>(
        "/Items?Recursive=true&IncludeItemTypes=Movie,Series&Fields=ProviderIds,Path&EnableImages=false&EnableUserData=false",
        { timeoutMs: 120_000 },
      );
      return res.Items;
    },
    /** Episodes present for a series (only physically present ones are returned by default). */
    episodes: async (seriesId: string) => {
      const res = await call<{ Items: JellyfinItem[] }>(
        `/Shows/${seriesId}/Episodes?Fields=ProviderIds&EnableImages=false&EnableUserData=false`,
        { timeoutMs: 60_000 },
      );
      return res.Items;
    },
  };
}
export type JellyfinClient = ReturnType<typeof jellyfin>;

/** Link into the Jellyfin web app (10.9+ hash routes). serverId keeps it working with several servers saved in the browser. */
export function jellyfinWebUrl(base: string, itemId: string, serverId?: string) {
  return joinUrl(base, `/web/#/details?id=${itemId}${serverId ? `&serverId=${serverId}` : ""}`);
}
