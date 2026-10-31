import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Media, Request } from "@/db/schema";
import { getSettings } from "@/lib/settings";
import { radarr } from "@/lib/clients/radarr";
import { sonarr, type SonarrClient, type SonarrEpisode, type SonarrSeries } from "@/lib/clients/sonarr";
import { setMediaStatus } from "@/lib/media";
import { mangarr } from "@/lib/clients/mangarr";
import { HttpError } from "@/lib/clients/http";

/** Send an approved request to Sonarr/Radarr. Throws on failure; caller records the error. */
export async function pushRequest(req: Request, media: Media) {
  if (req.target === "radarr") return pushMovie(req, media);
  if (req.target === "mangarr") return pushManga(req, media);
  return pushSeries(req, media);
}

/** Add the manga to Mangarr, or if it's there already, switch it on and reach back to the asked-for chapter. */
async function pushManga(req: Request, media: Media) {
  const api = mangarr((await getSettings()).mangarr);
  const start = req.startChapter ?? 0;
  try {
    await api.add(req.targetId, start);
  } catch (e) {
    if (!(e instanceof HttpError && e.status === 409)) throw e;
    const s = await api.series(req.targetId);
    await api.update(req.targetId, { monitored: true, startChapter: Math.min(s.startChapter, start) });
  }
  await setMediaStatus(media.id, "processing");
}

async function pushMovie(req: Request, media: Media) {
  const s = (await getSettings()).radarr;
  const api = radarr(s);
  const isAnime = media.kind === "anime";
  const dubProfile = isAnime && req.dub ? s.animeDubQualityProfileId : null;
  let movie = await api.movieByTmdb(req.targetId);
  if (movie) {
    // Only ever switched to dub, never back: dual audio has the original language too.
    if (!movie.monitored || (dubProfile && movie.qualityProfileId !== dubProfile))
      movie = await api.updateMovie({ ...movie, monitored: true, ...(dubProfile ? { qualityProfileId: dubProfile } : {}) });
    if (!movie.hasFile) await api.movieSearch([movie.id!]);
  } else {
    const lookup = await api.lookupTmdb(req.targetId);
    const profile = dubProfile || (isAnime && s.animeQualityProfileId) || s.qualityProfileId;
    const root = (isAnime && s.animeRootFolder) || s.rootFolder;
    if (!profile || !root) throw new Error("Radarr quality profile / root folder not configured");
    movie = await api.addMovie({
      ...lookup,
      qualityProfileId: profile,
      rootFolderPath: root,
      monitored: true,
      minimumAvailability: s.minimumAvailability,
      addOptions: { searchForMovie: true },
    });
  }
  await setMediaStatus(media.id, movie.hasFile ? "available" : "processing", { radarrId: movie.id });
}

async function pushSeries(req: Request, media: Media) {
  const s = (await getSettings()).sonarr;
  const api = sonarr(s);
  const isAnime = media.kind === "anime";
  const wantSeasons = new Set(req.seasons ?? []);
  const episodeLevel = !!req.episodeRanges?.length;
  const wholeSeries = req.absolute && !episodeLevel;
  const dubProfile = isAnime && req.dub ? s.animeDubQualityProfileId : null;

  let series = await api.seriesByTvdb(req.targetId);
  if (!series) {
    const lookup = await api.lookupTvdb(req.targetId);
    if (!lookup) throw new Error(`Sonarr could not find TVDB ${req.targetId}`);
    const profile = dubProfile || (isAnime && s.animeQualityProfileId) || s.qualityProfileId;
    const root = (isAnime && s.animeRootFolder) || s.rootFolder;
    if (!profile || !root) throw new Error("Sonarr quality profile / root folder not configured");
    const languageProfiles = await api.languageProfiles();
    const languageProfileId = languageProfiles.length ? (s.languageProfileId ?? languageProfiles[0].id) : null;
    series = await api.addSeries({
      ...lookup,
      qualityProfileId: profile,
      ...(languageProfileId ? { languageProfileId } : {}),
      rootFolderPath: root,
      seasonFolder: s.seasonFolder,
      seriesType: isAnime ? "anime" : "standard",
      monitored: true,
      seasons: lookup.seasons.map((x) => ({
        seasonNumber: x.seasonNumber,
        monitored: wholeSeries ? x.seasonNumber > 0 : !episodeLevel && wantSeasons.has(x.seasonNumber),
      })),
      // Searched episode by episode below instead (see searchRequested).
      addOptions: { searchForMissingEpisodes: false },
    });
  } else {
    // Existing series: switch on the requested seasons and search them.
    const toSearch: number[] = [];
    const seasons = series.seasons.map((x) => {
      const want = wholeSeries ? x.seasonNumber > 0 : !episodeLevel && wantSeasons.has(x.seasonNumber);
      if (want && !x.monitored) toSearch.push(x.seasonNumber);
      return want ? { ...x, monitored: true } : x;
    });
    // Only ever switched to dub, never back: dual audio has the original language too.
    const toDub = !!dubProfile && series.qualityProfileId !== dubProfile;
    if (toSearch.length || !series.monitored || toDub)
      series = await api.updateSeries({ ...series, monitored: true, seasons, ...(toDub ? { qualityProfileId: dubProfile } : {}) });
  }

  await setMediaStatus(media.id, "processing", { sonarrId: series.id, tvdbId: req.targetId });

  if (!(await syncEpisodeMonitoring(api, series, req))) {
    // A freshly added series has no episodes until Sonarr finishes refreshing it from TVDB. Don't make the
    // requester wait for that: flag it, retry in the background for a bit, and let the sync job finish it otherwise.
    await db.update(schema.requests).set({ needsEpisodeSync: true }).where(eq(schema.requests.id, req.id));
    void retryEpisodeSync(api, series, req);
  }
}

async function retryEpisodeSync(api: SonarrClient, series: SonarrSeries, req: Request, attempts = 24, delayMs = 5000) {
  for (let i = 0; i < attempts; i++) {
    await new Promise((r) => setTimeout(r, delayMs));
    try {
      if (await syncEpisodeMonitoring(api, series, req)) return;
    } catch (e) {
      console.warn(`[request ${req.id}] episode monitoring retry failed:`, e instanceof Error ? e.message : e);
    }
  }
}

export function episodesInRequest(episodes: SonarrEpisode[], req: Pick<Request, "absolute" | "seasons" | "episodeRanges">) {
  const ranges = req.episodeRanges ?? [];
  const season = req.seasons?.[0];
  return episodes.filter((e) => {
    const n = req.absolute ? e.absoluteEpisodeNumber : e.seasonNumber === season ? e.episodeNumber : undefined;
    if (n === undefined) return false;
    return ranges.some((r) => n >= r.from && (r.to === null || n <= r.to));
  });
}

// ---------- searching ----------

/**
 * Episodes waiting to be searched, sent to Sonarr one at a time, each grabbed as soon as it's found (a season search
 * grabs nothing until it has searched every episode). One at a time also leaves Sonarr free to import: it runs three
 * jobs at once, and a few long searches holding all three left finished downloads unimported until one ended.
 * A request stays flagged (needsEpisodeSync) until all its episodes have been sent, so if Jellyshelf restarts with
 * some still waiting, the availability sync queues them again.
 */
type Search =
  | { requestId: number; key: string; episodeId: number }
  /** After a request's episodes, one per season: the season search, if some of them still weren't found. */
  | { requestId: number; key: string; seriesId: number; season: number; episodeIds: number[] };
const waiting: Search[] = [];
/** "request:key" already sent, so the sync re-queueing a flagged request doesn't search those twice. */
const sent = new Set<string>();
let searching: Promise<void> | null = null;

export async function queueSearch(api: SonarrClient, req: Request, episodes: SonarrEpisode[]) {
  const isNew = (key: string) => !waiting.some((w) => w.key === key) && !sent.has(`${req.id}:${key}`);
  const fresh = episodes.filter((e) => isNew(`${e.id}`));
  waiting.push(...fresh.map((e) => ({ requestId: req.id, key: `${e.id}`, episodeId: e.id })));
  for (const season of new Set(fresh.map((e) => e.seasonNumber))) {
    const key = `season:${req.id}:${fresh[0].seriesId}:${season}`;
    const episodeIds = fresh.filter((e) => e.seasonNumber === season).map((e) => e.id);
    if (isNew(key)) waiting.push({ requestId: req.id, key, seriesId: fresh[0].seriesId, season, episodeIds });
  }
  const pending = waiting.some((w) => w.requestId === req.id);
  await db.update(schema.requests).set({ needsEpisodeSync: pending }).where(eq(schema.requests.id, req.id));
  searching ??= sendSearches(api).finally(() => (searching = null));
}

/** Resolves when the queue has emptied (for tests). */
export const searchesSent = () => searching ?? Promise.resolve();

async function sendSearches(api: SonarrClient) {
  while (waiting.length) {
    const next = waiting[0];
    try {
      if ("episodeId" in next) await api.waitForCommand((await api.episodeSearch([next.episodeId])).id);
      else await seasonFallback(api, next);
    } catch (e) {
      console.warn(`[search] ${next.key}:`, e instanceof Error ? e.message : e);
    }
    const { requestId } = waiting.shift()!;
    sent.add(`${requestId}:${next.key}`);
    if (!waiting.some((w) => w.requestId === requestId))
      await db.update(schema.requests).set({ needsEpisodeSync: false }).where(eq(schema.requests.id, requestId));
  }
}

/**
 * A season that dropped all at once mostly comes as season packs, which an episode search turns down ("Full season
 * pack"). So once a fully aired season's episodes have been searched, any still neither on disk nor downloading get
 * a season search, which takes packs.
 */
async function seasonFallback(api: SonarrClient, s: Extract<Search, { season: number }>) {
  const season = (await api.episodes(s.seriesId)).filter((e) => e.seasonNumber === s.season);
  if (!season.every((e) => aired(e, Date.now()))) return;
  const downloading = new Set((await api.queue(`&seriesIds=${s.seriesId}`)).map((r) => r.episodeId));
  if (!season.some((e) => s.episodeIds.includes(e.id) && !e.hasFile && !downloading.has(e.id))) return;
  await api.waitForCommand((await api.seasonSearch(s.seriesId, s.season)).id);
}

const aired = (e: SonarrEpisode, now: number) => !!e.airDateUtc && Date.parse(e.airDateUtc) <= now;

/** A season or whole-series request's monitored, missing episodes that have aired, in airing order. */
export function episodesToSearch(all: SonarrEpisode[], req: Pick<Request, "absolute" | "seasons">, now: number) {
  return all
    .filter(
      (e) =>
        e.monitored &&
        !e.hasFile &&
        aired(e, now) &&
        (req.absolute ? e.seasonNumber > 0 : (req.seasons ?? []).includes(e.seasonNumber)),
    )
    .sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber);
}

/**
 * Queue the searches for what a request wants, once Sonarr has the series' episodes: a split-cour / absolute range is
 * monitored exactly first. Returns false when Sonarr has no episodes yet (series still refreshing).
 */
export async function syncEpisodeMonitoring(api: SonarrClient, series: SonarrSeries, req: Request): Promise<boolean> {
  // Until Sonarr finishes adding a series (it clears addOptions then), its last step resets every episode's monitoring
  // to the seasons', which would undo ours: a film filed as a special ended up unmonitored and never downloaded.
  if ((await api.series(series.id!)).addOptions) return false;
  const all = await api.episodes(series.id!);
  if (!all.length) return false;
  if (!req.episodeRanges?.length) {
    await queueSearch(api, req, episodesToSearch(all, req, Date.now()));
    return true;
  }
  const wanted = episodesInRequest(all, req);
  if (!wanted.length) return false;

  // Open-ended range (still airing): monitor the season so future episodes are picked up,
  // then unmonitor earlier episodes that nothing asked for.
  const openEnded = req.episodeRanges?.some((r) => r.to === null);
  if (openEnded && !req.absolute && req.seasons?.length) {
    const before = new Set(all.filter((e) => e.monitored).map((e) => e.id));
    const fresh = await api.series(series.id!);
    await api.updateSeries({
      ...fresh,
      seasons: fresh.seasons.map((x) => (x.seasonNumber === req.seasons![0] ? { ...x, monitored: true } : x)),
    });
    const wantedIds = new Set(wanted.map((e) => e.id));
    const unmonitor = all
      .filter((e) => e.seasonNumber === req.seasons![0] && !wantedIds.has(e.id) && !before.has(e.id) && !e.hasFile)
      .map((e) => e.id);
    if (unmonitor.length) await api.monitorEpisodes(unmonitor, false);
  }

  await api.monitorEpisodes(wanted.map((e) => e.id), true);
  const now = Date.now();
  await queueSearch(api, req, wanted.filter((e) => !e.hasFile && aired(e, now)));
  return true;
}
