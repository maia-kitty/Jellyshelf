import { inArray, or } from "drizzle-orm";
import { db, schema } from "@/db";
import type { User } from "@/db/schema";
import { asUser, relayUrl } from "@/lib/playback";

/** One title in the user's Jellyfin library, ready for a card. */
export interface LibraryItem {
  id: string;
  type: "Movie" | "Series" | "Episode" | string;
  title: string;
  year: number | null;
  poster: string | null;
  /** The Jellyshelf page for it (AniList, TMDB) or the library's own item page. */
  href: string;
  /** Straight into the player. */
  playHref: string;
  played: boolean;
  /** 0–1 for part-watched movies/episodes, or how far through a series. */
  progress: number | null;
  /** Series: episodes not yet watched. */
  unplayed: number | null;
  /** For a new episode shown as its series: "S1 E2". */
  episode: string | null;
  rating: number | null;
}

export interface LibraryView {
  id: string;
  name: string;
  type: string | null;
}

interface JfLibItem {
  Id: string;
  Name: string;
  Type: string;
  ProductionYear?: number;
  ProviderIds?: Record<string, string>;
  ImageTags?: Record<string, string>;
  SeriesId?: string;
  SeriesName?: string;
  ParentIndexNumber?: number;
  IndexNumber?: number;
  CommunityRating?: number;
  UserData?: { Played?: boolean; PlayedPercentage?: number; UnplayedItemCount?: number };
}

const FIELDS = "Fields=ProviderIds,PrimaryImageAspectRatio&EnableImageTypes=Primary&ImageTypeLimit=1";

export async function libraryViews(user: User): Promise<LibraryView[]> {
  const jf = await asUser(user);
  const res = await jf.call<{ Items: { Id: string; Name: string; CollectionType?: string }[] }>(`/UserViews?userId=${jf.userId}`);
  return res.Items.filter((v) => !v.CollectionType || ["movies", "tvshows", "homevideos", "mixed"].includes(v.CollectionType)).map((v) => ({
    id: v.Id,
    name: v.Name,
    type: v.CollectionType ?? null,
  }));
}

export async function latestIn(user: User, viewId: string, limit = 20): Promise<LibraryItem[]> {
  const jf = await asUser(user);
  const items = await jf.call<JfLibItem[]>(`/Items/Latest?userId=${jf.userId}&ParentId=${viewId}&Limit=${limit}&GroupItems=true&${FIELDS}`);
  // A lone new episode comes back as itself; show it as its series (linked like the series), playing that episode.
  const seriesIds = [...new Set(items.filter((i) => i.Type === "Episode" && i.SeriesId).map((i) => i.SeriesId!))];
  const series = seriesIds.length
    ? new Map((await jf.call<{ Items: JfLibItem[] }>(`/Items?userId=${jf.userId}&Ids=${seriesIds.join(",")}&${FIELDS}`)).Items.map((s) => [s.Id, s]))
    : new Map<string, JfLibItem>();
  const shown = items.map((i) => (i.Type === "Episode" && i.SeriesId && series.has(i.SeriesId) ? { ...series.get(i.SeriesId)!, episodeOf: i } : i));
  const seen = new Set<string>();
  return toCards(shown.filter((i) => !seen.has(i.Id) && seen.add(i.Id)));
}

export const SORTS = {
  added: { label: "Recently added", q: "SortBy=DateCreated,SortName&SortOrder=Descending" },
  name: { label: "A–Z", q: "SortBy=SortName&SortOrder=Ascending" },
  year: { label: "Newest", q: "SortBy=ProductionYear,PremiereDate,SortName&SortOrder=Descending" },
  rating: { label: "Rating", q: "SortBy=CommunityRating,SortName&SortOrder=Descending" },
  played: { label: "Last watched", q: "SortBy=DatePlayed,SortName&SortOrder=Descending" },
} as const;
export type SortKey = keyof typeof SORTS;

export const FILTERS = {
  all: { label: "All", q: "" },
  unplayed: { label: "Unwatched", q: "&Filters=IsUnplayed" },
  played: { label: "Watched", q: "&Filters=IsPlayed" },
  favorites: { label: "Favourites", q: "&Filters=IsFavorite" },
} as const;
export type FilterKey = keyof typeof FILTERS;

export const PAGE_SIZE = 60;

export async function browse(user: User, viewId: string, opts: { sort: SortKey; filter: FilterKey; page: number }) {
  const jf = await asUser(user);
  const res = await jf.call<{ Items: JfLibItem[]; TotalRecordCount: number }>(
    `/Items?userId=${jf.userId}&ParentId=${viewId}&Recursive=true&IncludeItemTypes=Movie,Series&${SORTS[opts.sort].q}${FILTERS[opts.filter].q}` +
      `&StartIndex=${opts.page * PAGE_SIZE}&Limit=${PAGE_SIZE}&${FIELDS}`,
  );
  return { items: await toCards(res.Items), total: res.TotalRecordCount };
}

/**
 * Cards with links into Jellyshelf: anime to its AniList entry (season 1, or the earliest mapped one), everything
 * else to its TMDB page, and titles we can't place to the library's own item page.
 */
async function toCards(items: (JfLibItem & { episodeOf?: JfLibItem })[]): Promise<LibraryItem[]> {
  const anilistOf = await anilistIdsOf(items);
  return items.map((i) => {
    const tmdb = Number(i.ProviderIds?.Tmdb) || null;
    const anilistId = anilistOf(i);
    const href = anilistId
      ? `/anime/${anilistId}`
      : tmdb && (i.Type === "Movie" || i.Type === "Series")
        ? `/${i.Type === "Movie" ? "movie" : "tv"}/${tmdb}`
        : `/library/item/${i.Id}`;
    const pct = i.UserData?.PlayedPercentage;
    return {
      id: i.Id,
      type: i.Type,
      title: i.Name,
      year: i.ProductionYear ?? null,
      poster: i.ImageTags?.Primary ? relayUrl(`/Items/${i.Id}/Images/Primary?maxWidth=360&tag=${i.ImageTags.Primary}`) : null,
      href,
      playHref: i.episodeOf ? `/watch/${i.episodeOf.Id}` : i.Type === "Series" ? `/watch/series/${i.Id}` : `/watch/${i.Id}`,
      episode: i.episodeOf ? `S${i.episodeOf.ParentIndexNumber ?? "?"} E${i.episodeOf.IndexNumber ?? "?"}` : null,
      played: !!i.UserData?.Played,
      progress: pct ? pct / 100 : null,
      unplayed: i.Type === "Series" ? (i.UserData?.UnplayedItemCount ?? null) : null,
      rating: i.CommunityRating ?? null,
    };
  });
}

export interface LibraryDetail {
  id: string;
  type: string;
  title: string;
  year: number | null;
  overview: string | null;
  genres: string[];
  poster: string | null;
  backdrop: string | null;
  playHref: string;
  runtime: number | null;
  seasons: { id: string; name: string; episodes: { id: string; n: number | null; title: string; played: boolean; progress: number | null; thumb: string | null }[] }[];
}

/** The library's own page for titles Jellyshelf can't match to AniList or TMDB. */
export async function libraryDetail(user: User, id: string): Promise<LibraryDetail> {
  const jf = await asUser(user);
  type Full = JfLibItem & { Overview?: string; Genres?: string[]; BackdropImageTags?: string[]; RunTimeTicks?: number; ParentIndexNumber?: number; IndexNumber?: number; SeasonName?: string; SeasonId?: string };
  const item = await jf.call<Full>(`/Items/${id}?userId=${jf.userId}&Fields=Overview,Genres,ProviderIds`);
  const seasons: LibraryDetail["seasons"] = [];
  if (item.Type === "Series") {
    const eps = await jf.call<{ Items: Full[] }>(
      `/Items?userId=${jf.userId}&ParentId=${id}&Recursive=true&IncludeItemTypes=Episode&SortBy=ParentIndexNumber,IndexNumber&IsMissing=false&EnableImageTypes=Primary&ImageTypeLimit=1`,
    );
    for (const e of eps.Items) {
      const key = e.SeasonId ?? String(e.ParentIndexNumber ?? 0);
      let s = seasons.find((x) => x.id === key);
      if (!s) seasons.push((s = { id: key, name: e.SeasonName ?? (e.ParentIndexNumber ? `Season ${e.ParentIndexNumber}` : "Specials"), episodes: [] }));
      s.episodes.push({
        id: e.Id,
        n: e.IndexNumber ?? null,
        title: e.Name,
        played: !!e.UserData?.Played,
        progress: e.UserData?.PlayedPercentage ? e.UserData.PlayedPercentage / 100 : null,
        thumb: e.ImageTags?.Primary ? relayUrl(`/Items/${e.Id}/Images/Primary?maxWidth=320`) : null,
      });
    }
  }
  return {
    id,
    type: item.Type,
    title: item.Name,
    year: item.ProductionYear ?? null,
    overview: item.Overview ?? null,
    genres: item.Genres ?? [],
    poster: item.ImageTags?.Primary ? relayUrl(`/Items/${id}/Images/Primary?maxWidth=500`) : null,
    backdrop: item.BackdropImageTags?.length ? relayUrl(`/Items/${id}/Images/Backdrop?maxWidth=1920`) : null,
    playHref: item.Type === "Series" ? `/watch/series/${id}` : `/watch/${id}`,
    runtime: item.RunTimeTicks ? Math.round(item.RunTimeTicks / 600_000_000) : null,
    seasons,
  };
}

type Ided = { Type: string; ProviderIds?: Record<string, string> };

/**
 * Which AniList entry a Jellyfin title is, if it's anime: the AniList plugin's id, or else (from the mapping table) a
 * series' season 1 or earliest mapped entry, or a film's.
 */
export async function anilistIdsOf(items: Ided[]): Promise<(i: Ided) => number | undefined> {
  const tvdb = items.map((i) => Number(i.ProviderIds?.Tvdb)).filter(Boolean);
  const tmdbMovies = items.filter((i) => i.Type === "Movie").map((i) => Number(i.ProviderIds?.Tmdb)).filter(Boolean);
  const maps =
    tvdb.length || tmdbMovies.length
      ? await db
          .select()
          .from(schema.idMapping)
          .where(or(tvdb.length ? inArray(schema.idMapping.tvdbId, tvdb) : undefined, tmdbMovies.length ? inArray(schema.idMapping.tmdbMovieId, tmdbMovies) : undefined))
      : [];
  const firstEntry = new Map<number, { id: number; key: number }>();
  for (const m of maps) {
    if (!m.tvdbId || m.tvdbSeason === null || m.tvdbSeason === 0) continue;
    const key = (m.tvdbSeason === -1 ? 0 : m.tvdbSeason) * 100000 + m.episodeOffset;
    const cur = firstEntry.get(m.tvdbId);
    if (!cur || key < cur.key) firstEntry.set(m.tvdbId, { id: m.anilistId, key });
  }
  const animeFilm = new Map(maps.filter((m) => m.tmdbMovieId && m.type === "MOVIE").map((m) => [m.tmdbMovieId!, m.anilistId]));

  return (i) => {
    const tmdb = Number(i.ProviderIds?.Tmdb) || null;
    const series = i.Type === "Series" ? firstEntry.get(Number(i.ProviderIds?.Tvdb))?.id : undefined;
    const film = i.Type === "Movie" && tmdb ? animeFilm.get(tmdb) : undefined;
    return Number(i.ProviderIds?.AniList) || series || film;
  };
}
