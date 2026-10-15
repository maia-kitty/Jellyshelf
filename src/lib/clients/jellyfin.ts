import { createHash } from "node:crypto";
import { fetchJson, joinUrl } from "./http";

/**
 * Jellyfin tracks sessions (what's playing, which token belongs to whom) per device, so each Jellyshelf user is
 * their own device; the server's background work uses a shared one.
 */
export const SERVER_DEVICE = "jellyshelf-server";
/** One device per Jellyfin account; known before sign-in (the token comes back bound to it), so it's from the name. */
export const deviceIdFor = (username: string) =>
  `jellyshelf-${createHash("sha256").update(username.toLowerCase()).digest("hex").slice(0, 16)}`;

export function authHeader(token: string | undefined, deviceId = SERVER_DEVICE) {
  const client = `MediaBrowser Client="Jellyshelf", Device="${deviceId === SERVER_DEVICE ? "Server" : "Jellyshelf web"}", DeviceId="${deviceId}", Version="0.1.0"`;
  return token ? `${client}, Token="${token}"` : client;
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
  SeriesName?: string;
  RunTimeTicks?: number;
  UserData?: { PlaybackPositionTicks?: number; PlayedPercentage?: number | null; LastPlayedDate?: string; Played?: boolean };
}

export function jellyfin(cfg: { url: string; apiKey: string }) {
  if (!cfg.url) throw new Error("Jellyfin is not configured");
  const call = <T>(path: string, init: { method?: string; body?: unknown; token?: string; deviceId?: string; timeoutMs?: number } = {}) =>
    fetchJson<T>(joinUrl(cfg.url, path), {
      method: init.method,
      body: init.body,
      timeoutMs: init.timeoutMs,
      headers: { Authorization: authHeader(init.token ?? cfg.apiKey, init.deviceId) },
    });
  return {
    info: () => call<{ Id: string; ServerName: string; Version: string }>("/System/Info"),
    /** Signs in as the user. The token is tied to `deviceId`; send the same one with it later. */
    authenticate: (username: string, password: string, deviceId: string) =>
      call<{ User: { Id: string; Name: string; Policy: { IsAdministrator: boolean } }; AccessToken: string }>(
        "/Users/AuthenticateByName",
        { method: "POST", body: { Username: username, Pw: password }, token: "", deviceId },
      ),
    /** Every movie and series in the library with provider ids. */
    libraryItems: async () => {
      const res = await call<{ Items: JellyfinItem[] }>(
        "/Items?Recursive=true&IncludeItemTypes=Movie,Series&Fields=ProviderIds,Path&EnableImages=false&EnableUserData=false",
        { timeoutMs: 120_000 },
      );
      return res.Items;
    },
    /** A user's partly watched movies and episodes, most recent first. */
    resume: async (userId: string) => {
      const q = `Fields=ProviderIds&MediaTypes=Video&Limit=20&EnableImages=false`;
      // 10.9+ moved this under /UserItems; older servers only have the /Users/{id} form.
      const res = await call<{ Items: JellyfinItem[] }>(`/UserItems/Resume?userId=${userId}&${q}`).catch(() =>
        call<{ Items: JellyfinItem[] }>(`/Users/${userId}/Items/Resume?${q}`),
      );
      return res.Items;
    },
    /** The next episode of each series the user is part-way through, most recently watched series first. */
    nextUp: async (userId: string) =>
      (await call<{ Items: JellyfinItem[] }>(`/Shows/NextUp?userId=${userId}&Fields=ProviderIds&Limit=20&EnableImages=false`)).Items,
    /** Items by id, with this user's play data. */
    items: async (userId: string, ids: string[]) =>
      ids.length
        ? (await call<{ Items: JellyfinItem[] }>(`/Items?userId=${userId}&Ids=${ids.join(",")}&Fields=ProviderIds&EnableImages=false`)).Items
        : [],
    /** When the user last played anything in a series (series themselves carry no play date). */
    lastPlayedIn: async (userId: string, seriesId: string) => {
      const res = await call<{ Items: JellyfinItem[] }>(
        `/Items?userId=${userId}&ParentId=${seriesId}&Recursive=true&IncludeItemTypes=Episode&SortBy=DatePlayed&SortOrder=Descending&Limit=1&EnableImages=false`,
      );
      return res.Items[0]?.UserData?.LastPlayedDate ?? null;
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
