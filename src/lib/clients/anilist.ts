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
  /** Unix seconds of the last change to this entry. */
  updatedAt: number;
}

/** One episode on the airing schedule. */
export interface AiringSlot {
  airingAt: number;
  episode: number;
  media: AniMediaCard & { popularity: number; isAdult: boolean; countryOfOrigin: string | null };
}

export interface ListEntryPatch {
  status?: AniListStatus;
  progress?: number;
  /** 0-100, independent of the user's score format. */
  scoreRaw?: number;
  repeat?: number;
  startedAt?: FuzzyDate;
  completedAt?: FuzzyDate;
}

const ENTRY = `id mediaId status progress repeat score(format: POINT_100) updatedAt
  startedAt { year month day } completedAt { year month day }`;

const CARD = `
  id idMal format status season seasonYear episodes averageScore genres
  title { romaji english native userPreferred }
  coverImage { large extraLarge color }
`;

// --- rate limiting. AniList counts requests per minute (90, currently degraded to 30) and reports the
// limit in X-RateLimit-Limit / X-RateLimit-Remaining. Requests go out immediately, a few at a time,
// while this minute's budget lasts; only when it runs out do we wait. A 429 pauses everything for Retry-After.
const WINDOW_MS = 60_000;
const MAX_CONCURRENT = 4;

interface Limiter {
  /** Start times of requests in the last minute. */
  sent: number[];
  limit: number;
  active: number;
  pausedUntil: number;
}
const g = globalThis as unknown as { __anilistLimiter?: Limiter };
const limiter = (g.__anilistLimiter ??= { sent: [], limit: 30, active: 0, pausedUntil: 0 });

/**
 * AniList allows ~30 requests a minute, so anything already fetched is served from memory (for up to a day past its
 * expiry) while it refreshes in the background, rather than making a page wait for rate-limit room.
 */
const cachedAniList = <T>(key: string, ttl: number, fn: () => Promise<T>) => cached(key, ttl, fn, 86400);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function acquire() {
  for (;;) {
    const now = Date.now();
    while (limiter.sent.length && limiter.sent[0] <= now - WINDOW_MS) limiter.sent.shift();
    if (now < limiter.pausedUntil) {
      await sleep(limiter.pausedUntil - now);
    } else if (limiter.active >= MAX_CONCURRENT) {
      await sleep(50);
    } else if (limiter.sent.length >= limiter.limit - 1) {
      await sleep(limiter.sent[0] + WINDOW_MS - now); // keep one request of headroom
    } else {
      limiter.sent.push(now);
      limiter.active++;
      return;
    }
  }
}

function learn(res: Response) {
  const limit = Number(res.headers.get("x-ratelimit-limit"));
  const remaining = Number(res.headers.get("x-ratelimit-remaining"));
  // At least 2: one is kept as headroom, and with none left acquire() would wait on an empty queue forever.
  if (limit > 0) limiter.limit = Math.max(2, limit);
  // AniList's own count is the truth (other apps may share the IP); back off when it says we're nearly out.
  if (res.headers.has("x-ratelimit-remaining") && remaining <= 1) {
    limiter.pausedUntil = Math.max(limiter.pausedUntil, Date.now() + WINDOW_MS / 2);
  }
}

async function send(init: RequestInit): Promise<Response> {
  await acquire();
  try {
    // The timeout starts once we're through the queue: time spent waiting for rate-limit room isn't AniList being slow.
    const res = await fetch(GRAPHQL, { ...init, signal: AbortSignal.timeout(20_000) });
    learn(res);
    return res;
  } finally {
    limiter.active--;
  }
}

export async function anilistQuery<T>(query: string, variables: Record<string, unknown> = {}, token?: string, attempt = 0): Promise<T> {
  const res = await send({
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  if (res.status === 429 && attempt < 3) {
    const retry = Number(res.headers.get("retry-after") ?? "60") || 60;
    limiter.pausedUntil = Math.max(limiter.pausedUntil, Date.now() + retry * 1000);
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

export const FORMAT_LABEL: Record<AniFormat, string> = {
  TV: "TV",
  TV_SHORT: "TV Short",
  MOVIE: "Movie",
  SPECIAL: "Special",
  OVA: "OVA",
  ONA: "ONA",
  MUSIC: "Music",
};

/** "FALL", 2026 → "Fall 2026" */
export function seasonLabel(s: { season: string; year: number }) {
  return `${s.season[0]}${s.season.slice(1).toLowerCase()} ${s.year}`;
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
  return cachedAniList(`anilist:${key}:${JSON.stringify(vars)}:${page}:${perPage}`, ttl, async () => {
    const data = await anilistQuery<{ Page: AniPage<AniMediaCard> }>(pageQuery(filter, varDefs), { ...vars, page, perPage });
    return data.Page;
  });
}

export const anilist = {
  trending: (p: PageArgs = {}) => page("trending", "sort: TRENDING_DESC", "", {}, p),
  /** Trending titles with banner art and a synopsis, for the home page spotlight. */
  spotlight: () =>
    cachedAniList("anilist:spotlight", 900, async () => {
      const data = await anilistQuery<{ Page: AniPage<AniMediaCard & { bannerImage: string | null; description: string | null }> }>(
        `query { Page(perPage: 12) { pageInfo { currentPage hasNextPage total } media(type: ANIME, isAdult: false, sort: TRENDING_DESC) { ${CARD} bannerImage description(asHtml: false) } } }`,
      );
      return data.Page.media.filter((m) => m.bannerImage).slice(0, 6);
    }),
  popular: (p: PageArgs = {}) => page("popular", "sort: POPULARITY_DESC", "", {}, p, 3600),
  /**
   * Episodes airing between two times (unix seconds), soonest first. Up to 3 pages of 50; the week's schedule of
   * everything popular enough to matter fits comfortably. Cached by the hour.
   */
  schedule: (from: number, to: number) =>
    cachedAniList(`anilist:schedule:${Math.floor(from / 3600)}:${Math.floor(to / 3600)}`, 1800, async () => {
      // The pages are asked for together rather than one after another: three round trips become one.
      const page = (pg: number) =>
        anilistQuery<{ Page: { airingSchedules: AiringSlot[] } }>(
          `query ($from: Int, $to: Int, $page: Int) { Page(page: $page, perPage: 50) {
            airingSchedules(airingAt_greater: $from, airingAt_lesser: $to, sort: TIME) {
              airingAt episode media { ${CARD} popularity isAdult countryOfOrigin } } } }`,
          { from, to, page: pg },
        ).then((d) => d.Page.airingSchedules);
      const pages = await Promise.all([page(1), page(2).catch(() => []), page(3).catch(() => [])]);
      const seen = new Set<string>();
      return pages
        .flat()
        .filter((s) => !s.media.isAdult && !seen.has(`${s.media.id}:${s.episode}`) && seen.add(`${s.media.id}:${s.episode}`));
    }),
  /** What AniList users recommend alongside this title, best-rated first. */
  recommendations: (id: number) =>
    cachedAniList(`anilist:recs:${id}`, 86400, async () => {
      const data = await anilistQuery<{ Media: { recommendations: { nodes: { rating: number; mediaRecommendation: AniMediaCard | null }[] } } | null }>(
        `query ($id: Int) { Media(id: $id, type: ANIME) { recommendations(sort: RATING_DESC, perPage: 20) { nodes { rating mediaRecommendation { ${CARD} } } } } }`,
        { id },
      );
      return (data.Media?.recommendations.nodes ?? []).flatMap((n) => (n.mediaRecommendation && n.rating > 0 ? [n.mediaRecommendation] : []));
    }),
  seasonal: (season: AniSeason, year: number, p: PageArgs = {}) =>
    page("seasonal", "season: $season, seasonYear: $year, sort: POPULARITY_DESC", "$season: MediaSeason, $year: Int, ", { season, year }, p),
  search: (search: string, p: PageArgs = {}) =>
    page("search", "search: $search, sort: SEARCH_MATCH", "$search: String, ", { search }, p, 300),

  byIds: (ids: number[]) =>
    ids.length === 0
      ? Promise.resolve([] as AniMediaCard[])
      : cachedAniList(`anilist:ids:${[...ids].sort().join(",")}`, 900, async () => {
          const data = await anilistQuery<{ Page: AniPage<AniMediaCard> }>(
            `query ($ids: [Int]) { Page(perPage: 50) { pageInfo { currentPage hasNextPage total } media(id_in: $ids, type: ANIME) { ${CARD} } } }`,
            { ids: ids.slice(0, 50) },
          );
          return data.Page.media;
        }),

  media: (id: number) =>
    cachedAniList(`anilist:media:${id}`, 900, async () => {
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
    cachedAniList(`anilist:list:${userId}`, 120, async () => {
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

};

/**
 * Walk PREQUEL/SEQUEL edges to find the TV-ish entries in the same franchise, oldest first.
 * Only follows formats that live in Sonarr (TV, TV_SHORT, ONA); movies and OVAs break the chain.
 */
export async function franchiseChain(rootId: number, maxEntries = 12): Promise<AniMediaCard[]> {
  const SERIES: (AniFormat | null)[] = ["TV", "TV_SHORT", "ONA"];
  const seen = new Map<number, AniMediaCard & { start: number }>();
  let frontier = [rootId];
  // Breadth-first, one ring of prequels/sequels at a time, fetched in parallel.
  while (frontier.length && seen.size < maxEntries) {
    const batch = frontier.slice(0, maxEntries - seen.size);
    frontier = [];
    for (const m of await Promise.all(batch.map((id) => anilist.media(id)))) {
      if (!m || seen.has(m.id)) continue;
      const start = (m.startDate.year ?? 9999) * 10000 + (m.startDate.month ?? 0) * 100 + (m.startDate.day ?? 0);
      seen.set(m.id, { ...m, start });
      for (const e of m.relations.edges) {
        const next = e.node;
        if ((e.relationType === "PREQUEL" || e.relationType === "SEQUEL") && next.type === "ANIME" && SERIES.includes(next.format) && !seen.has(next.id) && !frontier.includes(next.id)) {
          frontier.push(next.id);
        }
      }
    }
  }
  return [...seen.values()].filter((m) => SERIES.includes(m.format)).sort((a, b) => a.start - b.start);
}
