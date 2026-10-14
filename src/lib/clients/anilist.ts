import { HttpError } from "./http";
import { cached, invalidate } from "@/lib/cache";

const GRAPHQL = "https://graphql.anilist.co";
export const ANILIST_AUTHORIZE = "https://anilist.co/api/v2/oauth/authorize";
export const ANILIST_TOKEN = "https://anilist.co/api/v2/oauth/token";

/** Must match the redirect URL registered on the AniList API client exactly. */
export function anilistRedirectUri(appUrl: string) {
  return new URL("/api/auth/anilist/callback", appUrl).toString();
}

export type AniFormat = "TV" | "TV_SHORT" | "MOVIE" | "SPECIAL" | "OVA" | "ONA" | "MUSIC";
export type AniStatus = "FINISHED" | "RELEASING" | "NOT_YET_RELEASED" | "CANCELLED" | "HIATUS";
export type AniSeason = "WINTER" | "SPRING" | "SUMMER" | "FALL";
export type AniListStatus = "CURRENT" | "PLANNING" | "COMPLETED" | "DROPPED" | "PAUSED" | "REPEATING";

export interface AniTitle {
  romaji: string | null;
  english: string | null;
  native: string | null;
  userPreferred: string | null;
}

export interface AniMediaCard {
  id: number;
  idMal: number | null;
  format: AniFormat | null;
  status: AniStatus | null;
  title: AniTitle;
  coverImage: { large: string | null; extraLarge: string | null; color: string | null };
  season: AniSeason | null;
  seasonYear: number | null;
  episodes: number | null;
  averageScore: number | null;
  genres: string[];
}

export type AniRelationType =
  | "PREQUEL"
  | "SEQUEL"
  | "PARENT"
  | "SIDE_STORY"
  | "SPIN_OFF"
  | "ALTERNATIVE"
  | "SUMMARY"
  | "ADAPTATION"
  | "CHARACTER"
  | "OTHER"
  | "SOURCE"
  | "COMPILATION"
  | "CONTAINS";

export interface AniMediaDetails extends AniMediaCard {
  type: "ANIME" | "MANGA";
  description: string | null;
  bannerImage: string | null;
  duration: number | null;
  popularity: number | null;
  startDate: { year: number | null; month: number | null; day: number | null };
  nextAiringEpisode: { episode: number; airingAt: number } | null;
  studios: { nodes: { name: string }[] };
  synonyms: string[];
  relations: { edges: { relationType: AniRelationType; node: AniMediaCard & { type: "ANIME" | "MANGA" } }[] };
}

export interface AniPage<T> {
  pageInfo: { currentPage: number; hasNextPage: boolean; total: number };
  media: T[];
}

export interface FuzzyDate {
  year: number | null;
  month: number | null;
  day: number | null;
}

export interface AniListEntry {
  id: number;
  mediaId: number;
  status: AniListStatus;
  progress: number;
  /** Always 0-100 (queried with format: POINT_100), regardless of the user's score format. */
  score: number;
  repeat: number;
  startedAt: FuzzyDate;
  completedAt: FuzzyDate;
}

export type ScoreFormat = "POINT_100" | "POINT_10_DECIMAL" | "POINT_10" | "POINT_5" | "POINT_3";

export interface ListEntryPatch {
  status?: AniListStatus;
  progress?: number;
  /** 0-100, independent of the user's score format. */
  scoreRaw?: number;
  repeat?: number;
  startedAt?: FuzzyDate;
  completedAt?: FuzzyDate;
}

const ENTRY = `id mediaId status progress repeat score(format: POINT_100)
  startedAt { year month day } completedAt { year month day }`;

const CARD = `
  id idMal format status season seasonYear episodes averageScore genres
  title { romaji english native userPreferred }
  coverImage { large extraLarge color }
`;

// --- rate limiting: AniList allows 90 req/min (currently degraded to 30). Space requests out and honour Retry-After.
const g = globalThis as unknown as { __anilistQueue?: Promise<unknown>; __anilistPausedUntil?: number };
const MIN_GAP_MS = 700;

function schedule<T>(fn: () => Promise<T>): Promise<T> {
  const run = async () => {
    const wait = (g.__anilistPausedUntil ?? 0) - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try {
      return await fn();
    } finally {
      g.__anilistPausedUntil = Math.max(g.__anilistPausedUntil ?? 0, Date.now() + MIN_GAP_MS);
    }
  };
  const p = (g.__anilistQueue ?? Promise.resolve()).then(run, run);
  g.__anilistQueue = p.catch(() => undefined);
  return p;
}

export async function anilistQuery<T>(query: string, variables: Record<string, unknown> = {}, token?: string, attempt = 0): Promise<T> {
  const res = await schedule(() =>
    fetch(GRAPHQL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    }),
  );
  if (res.status === 429 && attempt < 3) {
    const retry = Number(res.headers.get("retry-after") ?? "60");
    g.__anilistPausedUntil = Date.now() + retry * 1000;
    return anilistQuery(query, variables, token, attempt + 1);
  }
  const json = (await res.json().catch(() => null)) as { data?: T; errors?: { message: string; status?: number }[] } | null;
  if (!res.ok || !json || json.errors?.length) {
    throw new HttpError(res.status, GRAPHQL, json?.errors?.map((e) => e.message).join("; ") ?? "AniList request failed");
  }
  return json.data as T;
}

export function currentSeason(date = new Date()): { season: AniSeason; year: number } {
  const m = date.getMonth(); // 0-based
  const season: AniSeason = m < 3 ? "WINTER" : m < 6 ? "SPRING" : m < 9 ? "SUMMER" : "FALL";
  return { season, year: date.getFullYear() };
}

export function shiftSeason(s: { season: AniSeason; year: number }, delta: number) {
  const order: AniSeason[] = ["WINTER", "SPRING", "SUMMER", "FALL"];
  const idx = order.indexOf(s.season) + delta + s.year * 4;
  return { season: order[((idx % 4) + 4) % 4], year: Math.floor(idx / 4) };
}

export function aniTitle(t: AniTitle) {
  return t.english ?? t.userPreferred ?? t.romaji ?? t.native ?? "Untitled";
}

type PageArgs = { page?: number; perPage?: number };

function pageQuery(filter: string, varDefs: string) {
  return `query (${varDefs}$page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { currentPage hasNextPage total }
      media(type: ANIME, isAdult: false, ${filter}) { ${CARD} }
    }
  }`;
}

async function page(key: string, filter: string, varDefs: string, vars: Record<string, unknown>, { page = 1, perPage = 30 }: PageArgs, ttl = 900) {
  return cached(`anilist:${key}:${JSON.stringify(vars)}:${page}:${perPage}`, ttl, async () => {
    const data = await anilistQuery<{ Page: AniPage<AniMediaCard> }>(pageQuery(filter, varDefs), { ...vars, page, perPage });
    return data.Page;
  });
}

export const anilist = {
  trending: (p: PageArgs = {}) => page("trending", "sort: TRENDING_DESC", "", {}, p),
  popular: (p: PageArgs = {}) => page("popular", "sort: POPULARITY_DESC", "", {}, p, 3600),
  seasonal: (season: AniSeason, year: number, p: PageArgs = {}) =>
    page("seasonal", "season: $season, seasonYear: $year, sort: POPULARITY_DESC", "$season: MediaSeason, $year: Int, ", { season, year }, p),
  search: (search: string, p: PageArgs = {}) =>
    page("search", "search: $search, sort: SEARCH_MATCH", "$search: String, ", { search }, p, 300),

  byIds: (ids: number[]) =>
    ids.length === 0
      ? Promise.resolve([] as AniMediaCard[])
      : cached(`anilist:ids:${[...ids].sort().join(",")}`, 900, async () => {
          const data = await anilistQuery<{ Page: AniPage<AniMediaCard> }>(
            `query ($ids: [Int]) { Page(perPage: 50) { pageInfo { currentPage hasNextPage total } media(id_in: $ids, type: ANIME) { ${CARD} } } }`,
            { ids: ids.slice(0, 50) },
          );
          return data.Page.media;
        }),

  media: (id: number) =>
    cached(`anilist:media:${id}`, 900, async () => {
      const data = await anilistQuery<{ Media: AniMediaDetails | null }>(
        `query ($id: Int) { Media(id: $id, type: ANIME) {
          ${CARD} type description(asHtml: false) bannerImage duration popularity synonyms
          startDate { year month day }
          nextAiringEpisode { episode airingAt }
          studios(isMain: true) { nodes { name } }
          relations { edges { relationType node { ${CARD} type startDate { year month day } } } }
        } }`,
        { id },
      );
      return data.Media;
    }),

  viewer: (token: string) =>
    anilistQuery<{ Viewer: { id: number; name: string; avatar: { large: string | null } } }>(
      `query { Viewer { id name avatar { large } } }`,
      {},
      token,
    ).then((d) => d.Viewer),

  /** The full anime list for a user, keyed by media id. Cached briefly; invalidated on write. */
  userList: (userId: number, token: string) =>
    cached(`anilist:list:${userId}`, 120, async () => {
      const data = await anilistQuery<{
        MediaListCollection: { lists: { entries: (AniListEntry & { media: AniMediaCard })[] }[] };
      }>(
        `query ($userId: Int) { MediaListCollection(userId: $userId, type: ANIME) {
          lists { entries { ${ENTRY} media { ${CARD} } } }
        } }`,
        { userId },
        token,
      );
      const map = new Map<number, AniListEntry & { media: AniMediaCard }>();
      for (const list of data.MediaListCollection.lists) for (const e of list.entries) map.set(e.mediaId, e);
      return map;
    }),

  saveListEntry: (userId: number, token: string, mediaId: number, status: AniListStatus) =>
    anilist.updateListEntry(userId, token, mediaId, { status }),

  updateListEntry: async (userId: number, token: string, mediaId: number, patch: ListEntryPatch) => {
    const data = await anilistQuery<{ SaveMediaListEntry: AniListEntry }>(
      `mutation ($mediaId: Int, $status: MediaListStatus, $progress: Int, $scoreRaw: Int, $repeat: Int,
                 $startedAt: FuzzyDateInput, $completedAt: FuzzyDateInput) {
        SaveMediaListEntry(mediaId: $mediaId, status: $status, progress: $progress, scoreRaw: $scoreRaw,
                           repeat: $repeat, startedAt: $startedAt, completedAt: $completedAt) { ${ENTRY} }
      }`,
      { mediaId, ...patch },
      token,
    );
    invalidate(`anilist:list:${userId}`);
    return data.SaveMediaListEntry;
  },

  deleteListEntry: async (userId: number, token: string, entryId: number) => {
    await anilistQuery<{ DeleteMediaListEntry: { deleted: boolean } }>(
      `mutation ($id: Int) { DeleteMediaListEntry(id: $id) { deleted } }`,
      { id: entryId },
      token,
    );
    invalidate(`anilist:list:${userId}`);
  },

  scoreFormat: (userId: number, token: string) =>
    cached(`anilist:scoreformat:${userId}`, 3600, async () => {
      const d = await anilistQuery<{ Viewer: { mediaListOptions: { scoreFormat: ScoreFormat } } }>(
        `query { Viewer { mediaListOptions { scoreFormat } } }`,
        {},
        token,
      );
      return d.Viewer.mediaListOptions.scoreFormat;
    }),
};

/**
 * Walk PREQUEL/SEQUEL edges to find the TV-ish entries in the same franchise, oldest first.
 * Only follows formats that live in Sonarr (TV, TV_SHORT, ONA); movies and OVAs break the chain.
 */
export async function franchiseChain(rootId: number, maxDepth = 12): Promise<AniMediaCard[]> {
  const seen = new Map<number, AniMediaCard & { start: number }>();
  const queue: number[] = [rootId];
  const SERIES: (AniFormat | null)[] = ["TV", "TV_SHORT", "ONA"];
  while (queue.length && seen.size < maxDepth) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    const m = await anilist.media(id);
    if (!m) continue;
    const start = (m.startDate.year ?? 9999) * 10000 + (m.startDate.month ?? 0) * 100 + (m.startDate.day ?? 0);
    seen.set(id, { ...m, start });
    for (const e of m.relations.edges) {
      if ((e.relationType === "PREQUEL" || e.relationType === "SEQUEL") && e.node.type === "ANIME" && SERIES.includes(e.node.format)) {
        queue.push(e.node.id);
      }
    }
  }
  return [...seen.values()].filter((m) => SERIES.includes(m.format)).sort((a, b) => a.start - b.start);
}
