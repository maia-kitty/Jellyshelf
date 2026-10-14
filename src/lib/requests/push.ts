import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Media, Request } from "@/db/schema";
import { getSettings } from "@/lib/settings";
import { radarr } from "@/lib/clients/radarr";
import { sonarr, type SonarrClient, type SonarrEpisode, type SonarrSeries } from "@/lib/clients/sonarr";
import { setMediaStatus } from "@/lib/media";

/** Send an approved request to Sonarr/Radarr. Throws on failure; caller records the error. */
export async function pushRequest(req: Request, media: Media) {
  if (req.target === "radarr") return pushMovie(req, media);
  return pushSeries(req, media);
}

async function pushMovie(req: Request, media: Media) {
  const s = (await getSettings()).radarr;
  const api = radarr(s);
  const isAnime = media.kind === "anime";
  let movie = await api.movieByTmdb(req.targetId);
  if (movie) {
    if (!movie.monitored) movie = await api.updateMovie({ ...movie, monitored: true });
    if (!movie.hasFile) await api.movieSearch([movie.id!]);
  } else {
    const lookup = await api.lookupTmdb(req.targetId);
    const profile = (isAnime && s.animeQualityProfileId) || s.qualityProfileId;
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

  let series = await api.seriesByTvdb(req.targetId);
  if (!series) {
    const lookup = await api.lookupTvdb(req.targetId);
    if (!lookup) throw new Error(`Sonarr could not find TVDB ${req.targetId}`);
    const profile = (isAnime && s.animeQualityProfileId) || s.qualityProfileId;
    const root = (isAnime && s.animeRootFolder) || s.rootFolder;
    if (!profile || !root) throw new Error("Sonarr quality profile / root folder not configured");
    const languageProfileId = s.languageProfileId ?? (await api.languageProfiles())[0]?.id;
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
      addOptions: { searchForMissingEpisodes: !episodeLevel },
    });
  } else {
    // Existing series: switch on the requested seasons and search them.
    const toSearch: number[] = [];
    const seasons = series.seasons.map((x) => {
      const want = wholeSeries ? x.seasonNumber > 0 : !episodeLevel && wantSeasons.has(x.seasonNumber);
      if (want && !x.monitored) toSearch.push(x.seasonNumber);
      return want ? { ...x, monitored: true } : x;
    });
    if (toSearch.length || !series.monitored) series = await api.updateSeries({ ...series, monitored: true, seasons });
    for (const n of wholeSeries || episodeLevel ? [] : [...wantSeasons]) await api.seasonSearch(series.id!, n);
    if (wholeSeries) await api.command({ name: "SeriesSearch", seriesId: series.id });
  }

  await setMediaStatus(media.id, "processing", { sonarrId: series.id, tvdbId: req.targetId });

  if (episodeLevel && !(await syncEpisodeMonitoring(api, series, req))) {
    // A freshly added series has no episodes until Sonarr finishes refreshing it from TVDB. Don't make the
    // requester wait for that: flag it, retry in the background for a bit, and let the sync job finish it otherwise.
    await db.update(schema.requests).set({ needsEpisodeSync: true }).where(eq(schema.requests.id, req.id));
    void retryEpisodeSync(api, series, req);
  }
}

async function retryEpisodeSync(api: SonarrClient, series: SonarrSeries, req: Request, attempts = 10, delayMs = 3000) {
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

/**
 * Monitor exactly the episode range of a split-cour / absolute request and search for it.
 * Returns false when Sonarr has no episodes yet (series still refreshing).
 */
export async function syncEpisodeMonitoring(api: SonarrClient, series: SonarrSeries, req: Request): Promise<boolean> {
  const all = await api.episodes(series.id!);
  if (!all.length) return false;
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
  const missing = wanted.filter((e) => !e.hasFile).map((e) => e.id);
  if (missing.length) await api.episodeSearch(missing);
  await db.update(schema.requests).set({ needsEpisodeSync: false }).where(eq(schema.requests.id, req.id));
  return true;
}
