// What the Android app can download (see app.ts). Plain data builders, usable on the server and in the browser.

/** One thing to keep on the phone. `path` is fetched from this server with the app's session. */
export interface AppDownload {
  key: string;
  kind: "manga" | "video";
  /** The series (or film) it belongs to: the Downloads screen groups by this. */
  group: string;
  title: string;
  path: string;
  poster: string | null;
  /** Sorts within the group: chapter number, or season × 10000 + episode. */
  sort: number;
  size?: number | null;
  /** For syncing offline progress back: AniList manga id + chapter, or the Jellyfin item. */
  anilistId?: number;
  chapter?: number;
  itemId?: string;
}

export const mangaDownload = (anilistId: number, chapter: number, series: string, name: string | null, poster: string | null): AppDownload => ({
  key: `m:${anilistId}:${chapter}`,
  kind: "manga",
  group: series,
  title: name || `Chapter ${chapter}`,
  path: `/api/manga/${anilistId}/${chapter}/file`,
  poster,
  sort: chapter,
  anilistId,
  chapter,
});

/** `playUrl` is the player link (/watch/<Jellyfin item id>); the original file is fetched through the Jellyfin relay. */
export const videoDownload = (playUrl: string, group: string, title: string, sort: number, size?: number | null): AppDownload => {
  const itemId = playUrl.split("/").pop()!;
  return {
    key: `v:${itemId}`,
    kind: "video",
    group,
    title,
    path: `/api/jf/Videos/${itemId}/stream?static=true`,
    poster: `/api/jf/Items/${itemId}/Images/Primary?maxWidth=480`,
    sort,
    size,
    itemId,
  };
};

