import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { forgetSubs } from "@/lib/subtitles";
import { jellyfin } from "@/lib/clients/jellyfin";
import { qbittorrent } from "@/lib/clients/qbittorrent";
import { radarr } from "@/lib/clients/radarr";
import { sonarr, type SonarrEpisode } from "@/lib/clients/sonarr";
import { getSettings } from "@/lib/settings";
import type { Request } from "@/db/schema";
import { episodesInRequest } from "@/lib/requests/push";
import { sentOn, wholeSeries } from "@/lib/requestScope";

export type ManagedService = "sonarr" | "radarr";

/** A series or movie as Settings → Manage library lists it, for deleting. */
export interface ManagedTitle {
  service: ManagedService;
  /** Sonarr series id / Radarr movie id. */
  id: number;
  title: string;
  year: number | null;
  size: number;
  /** Episode files, or 1/0 for a film. */
  files: number;
  requestedBy: string[];
  /** Its page in Jellyshelf. */
  href: string | null;
}

/** Everything in Sonarr and Radarr, biggest first. A service that can't be read is reported, not fatal. */
export async function managedTitles(): Promise<{ titles: ManagedTitle[]; errors: string[] }> {
  const s = await getSettings();
  const errors: string[] = [];
  const [series, movies, reqs, media] = await Promise.all([
    s.sonarr.url && s.sonarr.apiKey ? sonarr(s.sonarr).allSeries().catch((e) => (errors.push(`Sonarr: ${e.message}`), [])) : [],
    s.radarr.url && s.radarr.apiKey ? radarr(s.radarr).allMovies().catch((e) => (errors.push(`Radarr: ${e.message}`), [])) : [],
    db
      .select({ target: schema.requests.target, targetId: schema.requests.targetId, user: schema.users.displayName })
      .from(schema.requests)
      .innerJoin(schema.users, eq(schema.users.id, schema.requests.userId)),
    db.select().from(schema.media),
  ]);
  const requesters = new Map<string, Set<string>>();
  for (const r of reqs) requesters.set(`${r.target}:${r.targetId}`, (requesters.get(`${r.target}:${r.targetId}`) ?? new Set()).add(r.user));
  const by = (k: string) => [...(requesters.get(k) ?? [])];
  // Anime is browsed by AniList entry; plain titles by TMDB.
  const page = (m: (typeof media)[number] | undefined) => m && (m.kind === "anime" ? `/anime/${m.anilistId}` : `/${m.kind}/${m.tmdbId}`);

  const titles: ManagedTitle[] = [
    ...series.map((x) => ({
      service: "sonarr" as const,
      id: x.id!,
      title: x.title,
      year: x.year ?? null,
      size: x.statistics?.sizeOnDisk ?? 0,
      files: x.statistics?.episodeFileCount ?? 0,
      requestedBy: by(`sonarr:${x.tvdbId}`),
      href: page(media.find((m) => m.sonarrId === x.id && m.kind === "tv") ?? media.find((m) => m.sonarrId === x.id)) ?? (x.tmdbId ? `/tv/${x.tmdbId}` : null),
    })),
    ...movies.map((x) => ({
      service: "radarr" as const,
      id: x.id!,
      title: x.title,
      year: x.year || null,
      size: x.sizeOnDisk ?? 0,
      files: x.hasFile ? 1 : 0,
      requestedBy: by(`radarr:${x.tmdbId}`),
      href: page(media.find((m) => m.radarrId === x.id && m.kind === "anime")) ?? `/movie/${x.tmdbId}`,
    })),
  ];
  return { titles: titles.sort((a, b) => b.size - a.size), errors };
}

/**
 * Delete what a request went to. A film, or a whole series, goes from Radarr/Sonarr (see deleteTitle). A request for
 * part of a series (some seasons, an episode range) takes out only that part (see removeSeriesPart), unless nothing
 * else of the series is wanted or on disk, when the whole series goes after all. Null when it isn't in Sonarr/Radarr
 * (any more), or they aren't set up.
 */
export async function deleteRequested(r: Request, deleteFiles: boolean) {
  const s = await getSettings();
  if (!s[r.target].url || !s[r.target].apiKey) return null;
  if (r.target === "radarr") {
    const movie = await radarr(s.radarr).movieByTmdb(r.targetId);
    return movie ? { note: await deleteTitle("radarr", movie.id!, deleteFiles) } : null;
  }
  const series = await sonarr(s.sonarr).seriesByTvdb(r.targetId);
  if (!series) return null;
  const part = wholeSeries(r) ? undefined : await removeSeriesPart(r, series.id!, deleteFiles);
  return { note: part !== undefined ? part : await deleteTitle("sonarr", series.id!, deleteFiles) };
}

/** The episodes a series request covers. */
function requestEpisodes(eps: SonarrEpisode[], r: Request) {
  if (wholeSeries(r)) return eps;
  if (r.episodeRanges?.length) return episodesInRequest(eps, r);
  return eps.filter((e) => r.seasons!.includes(e.seasonNumber));
}

/**
 * Take one request's part of a series out of Sonarr: its episodes are switched off (unmonitored), and with
 * `deleteFiles` their files are deleted along with the torrents that only held them. Episodes another request still
 * wants stay, and so does the rest of the series and every other request. Returns a note as deleteTitle does, or
 * undefined (nothing done) when nothing else of the series is wanted or on disk, so the whole series should go.
 */
async function removeSeriesPart(r: Request, seriesId: number, deleteFiles: boolean): Promise<string | null | undefined> {
  const s = await getSettings();
  const api = sonarr(s.sonarr);
  const eps = await api.episodes(seriesId);
  const others = (await db.select().from(schema.requests).where(and(eq(schema.requests.target, "sonarr"), eq(schema.requests.targetId, r.targetId)))).filter(
    (o) => o.id !== r.id && sentOn(o),
  );
  const kept = new Set(others.flatMap((o) => requestEpisodes(eps, o)).map((e) => e.id));
  const removing = new Set(requestEpisodes(eps, r).map((e) => e.id).filter((id) => !kept.has(id)));
  const rest = eps.filter((e) => !removing.has(e.id));
  if (!others.length && rest.every((e) => !e.monitored && !e.hasFile)) return undefined;

  // Files kept: Sonarr still tracks the series, so it clears those torrents itself after seeding.
  const qbit = deleteFiles && s.qbittorrent.url ? qbittorrent(s.qbittorrent) : null;
  const torrents = qbit ? await grabbedTorrents("sonarr", seriesId, removing).catch(() => null) : [];
  // Switching a season off unmonitors all of it, and stops Sonarr monitoring its new episodes: only when nothing else in it is wanted.
  const series = await api.series(seriesId);
  const off = new Set(series.seasons.filter((x) => x.monitored && r.seasons?.includes(x.seasonNumber) && !rest.some((e) => e.seasonNumber === x.seasonNumber && e.monitored)).map((x) => x.seasonNumber));
  if (off.size) await api.updateSeries({ ...series, seasons: series.seasons.map((x) => (off.has(x.seasonNumber) ? { ...x, monitored: false } : x)) });
  if (removing.size) await api.monitorEpisodes([...removing], false);
  if (deleteFiles) {
    // A file can hold several episodes: only those all of whose episodes are going.
    const keepFiles = new Set(rest.map((e) => e.episodeFileId));
    const files = [...new Set(eps.filter((e) => removing.has(e.id) && e.episodeFileId && !keepFiles.has(e.episodeFileId)).map((e) => e.episodeFileId!))];
    if (files.length) await api.deleteEpisodeFiles(files);
    forgetSubs();
    if (s.jellyfin.url && s.jellyfin.apiKey) {
      await jellyfin(s.jellyfin)
        .refreshLibrary()
        .catch((e) => console.warn("[manage] Jellyfin rescan failed:", e instanceof Error ? e.message : e));
    }
  }
  // Its status settles on the next availability sync, from what's left.
  await db.delete(schema.requests).where(eq(schema.requests.id, r.id));
  return qbit ? clearTorrents(qbit, torrents) : null;
}

/**
 * Torrents Sonarr/Radarr grabbed for a title (their ids are the torrent hashes; other clients' ids don't look like one).
 * With `onlyEpisodes`, just those all of whose episodes are in it: a season pack that also holds kept episodes stays.
 */
async function grabbedTorrents(service: ManagedService, id: number, onlyEpisodes?: Set<number>) {
  const s = await getSettings();
  const path = service === "sonarr" ? `/history/series?seriesId=${id}&eventType=1` : `/history/movie?movieId=${id}&eventType=1`;
  const grabs = await (service === "sonarr" ? sonarr(s.sonarr) : radarr(s.radarr)).call<{ downloadId?: string; episodeId?: number }[]>(path);
  const elsewhere = new Set(onlyEpisodes ? grabs.filter((g) => !onlyEpisodes.has(g.episodeId ?? -1)).map((g) => g.downloadId) : []);
  return [...new Set(grabs.map((g) => g.downloadId ?? "").filter((h) => /^[0-9a-f]{40}$/i.test(h) && !elsewhere.has(h)))];
}

/** Remove torrents with their downloads; a note when that couldn't be done (`torrents` null: they couldn't be looked up). */
async function clearTorrents(qbit: ReturnType<typeof qbittorrent>, torrents: string[] | null): Promise<string | null> {
  if (!torrents) return `Couldn't find its torrents, so they're still in qBittorrent.`;
  try {
    await qbit.remove(torrents, true);
    return null;
  } catch (e) {
    console.warn("[manage] qBittorrent:", e instanceof Error ? e.message : e);
    // Its own sign-in complaint says what's wrong; anything else (network, timeout, HTTP error) is just unreachable.
    const why = e instanceof Error && e.message.startsWith("qBittorrent") ? e.message : "Couldn't reach qBittorrent";
    return `${why}, so its ${torrents.length === 1 ? "torrent is" : `${torrents.length} torrents are`} still there.`;
  }
}

/**
 * Remove a title from Sonarr/Radarr, and its requests, so it can be requested again. Anime seasons sharing one Sonarr
 * series all go with it. With `deleteFiles` its files go too (Jellyfin is asked to rescan, so it leaves there as well);
 * without, they stay where they are and it stays watchable in Jellyfin.
 *
 * Its torrents leave qBittorrent either way, with their downloaded copy: Sonarr/Radarr stop tracking them once the
 * title's gone, so nothing else would ever clean them up. Kept library files are hardlinks (or copies) of that copy,
 * so they stay. Returns a note when that part couldn't be done.
 */
export async function deleteTitle(service: ManagedService, id: number, deleteFiles = true): Promise<string | null> {
  const s = await getSettings();
  const qbit = s.qbittorrent.url ? qbittorrent(s.qbittorrent) : null;
  // Read before the delete, which takes the title's history with it.
  const torrents = qbit ? await grabbedTorrents(service, id).catch(() => null) : [];
  let key: number;
  if (service === "sonarr") {
    const api = sonarr(s.sonarr);
    key = (await api.series(id)).tvdbId;
    await api.call(`/series/${id}?deleteFiles=${deleteFiles}&addImportListExclusion=false`, { method: "DELETE", timeoutMs: 60_000 });
  } else {
    const api = radarr(s.radarr);
    key = (await api.movie(id)).tmdbId;
    await api.call(`/movie/${id}?deleteFiles=${deleteFiles}&addImportExclusion=false`, { method: "DELETE", timeoutMs: 60_000 });
  }
  // Left alone, the next sync would mark these failed ("Removed from Sonarr") instead.
  await db.delete(schema.requests).where(and(eq(schema.requests.target, service), eq(schema.requests.targetId, key)));
  const unlink = service === "sonarr" ? { sonarrId: null } : { radarrId: null };
  // Files kept: still in the library as far as Jellyfin goes; the next sync settles its status from there.
  await db
    .update(schema.media)
    .set(deleteFiles ? { ...unlink, status: "unknown", seasonStatus: null, jellyfinItemId: null } : unlink)
    .where(eq(service === "sonarr" ? schema.media.sonarrId : schema.media.radarrId, id));
  forgetSubs();
  if (deleteFiles && s.jellyfin.url && s.jellyfin.apiKey) {
    await jellyfin(s.jellyfin)
      .refreshLibrary()
      .catch((e) => console.warn("[manage] Jellyfin rescan failed:", e instanceof Error ? e.message : e));
  }
  return qbit ? clearTorrents(qbit, torrents) : null;
}
