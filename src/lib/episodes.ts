import { cached } from "./cache";
import { getSettings } from "./settings";
import { jellyfin, jellyfinWebUrl, type JellyfinItem } from "./clients/jellyfin";
import { sonarr, type SonarrSeries } from "./clients/sonarr";
import type { AnimeTarget } from "./mapping/resolve";
import { scopeEpisodes } from "./episodeScope";
import { radarr } from "./clients/radarr";
import type { ArrFile } from "./clients/arr";
import { trackLangs } from "./langs";
import { fileSubs, movieSubs, seriesSubs, summarize, type FileSubs, type SubsSummary } from "./subtitles";

export interface EpisodeRow {
  /** Sonarr episode id (what Bazarr uses), when the episode came from Sonarr. */
  id: number | null;
  season: number;
  episode: number;
  absolute: number | null;
  /** Number within the AniList entry (what list progress counts), or the season episode number for plain TV. */
  n: number;
  title: string;
  airDate: string | null;
  hasFile: boolean;
  quality: string | null;
  size: number | null;
  /** Deep link to the episode in Jellyfin, if Jellyfin has it. */
  playUrl: string | null;
  /** From Bazarr, for downloaded episodes. */
  subs?: FileSubs;
  /** Audio track languages of the file ("JA", "EN"): the dubs. */
  audio: string[];
}

/** Where a title's subtitles live in Bazarr, and how complete they are. */
export interface SubsInfo {
  kind: "series" | "movie";
  /** Sonarr series id or Radarr movie id. */
  id: number;
  summary: SubsSummary;
}

export interface EpisodesInfo {
  /** Link to the series/movie page in Jellyfin. */
  playUrl: string | null;
  episodes: EpisodeRow[];
  /** Episodes in scope that have aired (or are known), and how many are downloaded. */
  total: number;
  downloaded: number;
  /** Null when Bazarr isn't set up, can't be reached, or doesn't know the title. */
  subs: SubsInfo | null;
}

const EMPTY: EpisodesInfo = { playUrl: null, episodes: [], total: 0, downloaded: 0, subs: null };

async function jellyfinCtx() {
  const s = (await getSettings()).jellyfin;
  if (!s.url || !s.apiKey) return null;
  const api = jellyfin(s);
  const base = s.publicUrl || s.url;
  const [library, serverId] = await Promise.all([
    cached("jellyfin:library", 600, api.libraryItems),
    cached("jellyfin:serverId", 3600, async () => (await api.info()).Id),
  ]);
  return { api, library, link: (id: string) => jellyfinWebUrl(base, id, serverId) };
}

const folder = (p?: string) => p?.replace(/[\\/]+$/, "").split(/[\\/]/).pop()?.toLowerCase();

/**
 * Find a title in the Jellyfin library: by the item id the availability sync stored, by provider ids,
 * then by folder name (Jellyfin often has no provider ids for anime, but shares the folder Sonarr created).
 */
function findItem(
  library: JellyfinItem[],
  type: "Movie" | "Series",
  hint: { itemId?: string | null; tmdbId?: number | null; tvdbId?: number | null; anilistId?: number | null; path?: string | null },
) {
  const items = library.filter((i) => i.Type === type);
  const p = (i: JellyfinItem, k: string) => i.ProviderIds?.[k];
  return (
    (hint.itemId && items.find((i) => i.Id === hint.itemId)) ||
    (hint.anilistId && items.find((i) => p(i, "AniList") === String(hint.anilistId))) ||
    (hint.tvdbId && items.find((i) => p(i, "Tvdb") === String(hint.tvdbId))) ||
    (hint.tmdbId && items.find((i) => p(i, "Tmdb") === String(hint.tmdbId))) ||
    (hint.path && items.find((i) => folder(i.Path) === folder(hint.path!))) ||
    null
  );
}

/** What's on disk for a film, from Radarr. */
export interface FileInfo {
  name: string | null;
  size: number;
  quality: string | null;
  resolution: string | null;
  videoCodec: string | null;
  /** "HDR10", "DV"… empty for SDR */
  hdr: string | null;
  /** Audio track languages: the dubs ("JA", "EN"). */
  audio: string[];
  /** Subtitle tracks inside the video file (Bazarr only lists external ones as "have" when it's told to). */
  embeddedSubs: string[];
}

export function fileInfo(f: ArrFile): FileInfo {
  const mi = f.mediaInfo ?? {};
  return {
    name: f.relativePath?.split(/[\\/]/).pop() ?? null,
    size: f.size,
    quality: f.quality?.quality?.name ?? null,
    resolution: mi.resolution?.replace("x", "×") ?? null,
    videoCodec: mi.videoCodec || null,
    hdr: mi.videoDynamicRangeType || null,
    audio: trackLangs(mi.audioLanguages),
    embeddedSubs: trackLangs(mi.subtitles),
  };
}

export interface MovieLibraryInfo extends EpisodesInfo {
  /** Radarr's id, if Radarr has the film. */
  radarrId: number | null;
  file: FileInfo | null;
}

/** Jellyfin link, Radarr file details and Bazarr subtitles for a movie (plain or anime film). */
export async function movieInfo(hint: { itemId?: string | null; tmdbId: number; anilistId?: number | null; radarrId?: number | null }): Promise<MovieLibraryInfo> {
  const [jf, movie] = await Promise.all([jellyfinCtx().catch(() => null), radarrMovie(hint.tmdbId, hint.radarrId)]);
  const item = jf && findItem(jf.library, "Movie", hint);
  const subs = movie?.id && movie.hasFile ? await movieSubs(movie.id) : null;
  return {
    ...EMPTY,
    playUrl: item ? jf.link(item.Id) : null,
    radarrId: movie?.id ?? null,
    file: movie?.hasFile && movie.movieFile ? fileInfo(movie.movieFile) : null,
    subs: movie?.id && subs ? { kind: "movie", id: movie.id, summary: summarize([subs]) } : null,
  };
}

async function radarrMovie(tmdbId: number, radarrId?: number | null) {
  const s = (await getSettings()).radarr;
  if (!s.url || !s.apiKey) return null;
  const api = radarr(s);
  return cached(`radarr:movie:${radarrId ?? `tmdb${tmdbId}`}`, 30, () => (radarrId ? api.movie(radarrId) : api.movieByTmdb(tmdbId))).catch(() => null);
}

/**
 * Downloaded episodes for a series, scoped to one AniList entry when `target` is given.
 * Sonarr is the source for what's downloaded (titles, quality, size); Jellyfin supplies play links.
 * Without Sonarr, falls back to whatever Jellyfin has.
 */
export async function seriesEpisodes(opts: {
  tvdbId: number | null;
  tmdbId?: number | null;
  anilistId?: number | null;
  jellyfinItemId?: string | null;
  target: Extract<AnimeTarget, { service: "sonarr" }> | null;
}): Promise<EpisodesInfo> {
  const settings = await getSettings();
  const jf = await jellyfinCtx().catch(() => null);

  let series: SonarrSeries | null = null;
  let sonarrEps: Awaited<ReturnType<ReturnType<typeof sonarr>["episodes"]>> = [];
  if (opts.tvdbId && settings.sonarr.url && settings.sonarr.apiKey) {
    const api = sonarr(settings.sonarr);
    series = await api.seriesByTvdb(opts.tvdbId).catch(() => null);
    if (series) sonarrEps = await api.episodes(series.id!, true).catch(() => []);
  }
  const bazarrEps = series && sonarrEps.length ? await seriesSubs(series.id!) : null;
  const subsById = new Map(bazarrEps?.map((e) => [e.sonarrEpisodeId, fileSubs(e)]));

  const item = jf && findItem(jf.library, "Series", { itemId: opts.jellyfinItemId, tvdbId: opts.tvdbId, tmdbId: opts.tmdbId, anilistId: opts.anilistId, path: series?.path });
  const jfEps = item ? await cached(`jellyfin:eps:${item.Id}`, 120, () => jf!.api.episodes(item.Id)).catch(() => []) : [];
  const jfByKey = new Map(jfEps.map((e) => [`${e.ParentIndexNumber}x${e.IndexNumber}`, e]));
  const playUrl = item ? jf!.link(item.Id) : null;

  if (sonarrEps.length) {
    const now = Date.now();
    const scoped = scopeEpisodes(
      sonarrEps.map((e) => ({ ...e, season: e.seasonNumber, episode: e.episodeNumber, absolute: e.absoluteEpisodeNumber ?? null })),
      opts.target,
    );
    const rows: EpisodeRow[] = scoped.map((e) => {
      const j = jfByKey.get(`${e.season}x${e.episode}`);
      return {
        id: e.id,
        season: e.season,
        episode: e.episode,
        absolute: e.absolute,
        n: e.n,
        title: e.title,
        airDate: e.airDateUtc ?? null,
        hasFile: e.hasFile,
        quality: e.episodeFile?.quality?.quality?.name ?? null,
        size: e.episodeFile?.size ?? null,
        playUrl: j ? jf!.link(j.Id) : null,
        subs: e.hasFile ? subsById.get(e.id) : undefined,
        audio: e.hasFile ? trackLangs(e.episodeFile?.mediaInfo?.audioLanguages) : [],
      };
    });
    const aired = rows.filter((r) => r.hasFile || !r.airDate || Date.parse(r.airDate) <= now);
    const withSubs = rows.flatMap((r) => (r.subs ? [r.subs] : []));
    return {
      playUrl,
      episodes: rows,
      total: aired.length,
      downloaded: rows.filter((r) => r.hasFile).length,
      subs: bazarrEps && withSubs.length ? { kind: "series", id: series!.id!, summary: summarize(withSubs) } : null,
    };
  }

  if (jfEps.length) {
    const scoped = scopeEpisodes(
      jfEps
        .filter((e) => e.ParentIndexNumber !== undefined && e.IndexNumber !== undefined)
        .map((e) => ({ id: e.Id, title: e.Name, season: e.ParentIndexNumber!, episode: e.IndexNumber!, absolute: null })),
      // Jellyfin has no absolute numbers; show everything rather than nothing.
      opts.target?.absolute ? null : opts.target,
    );
    const rows = scoped.map((e) => ({
      id: null,
      season: e.season,
      episode: e.episode,
      absolute: null,
      n: e.n,
      title: e.title,
      airDate: null,
      hasFile: true,
      quality: null,
      size: null,
      playUrl: jf!.link(e.id),
      audio: [],
    }));
    return { playUrl, episodes: rows, total: rows.length, downloaded: rows.length, subs: null };
  }

  return { ...EMPTY, playUrl };
}
