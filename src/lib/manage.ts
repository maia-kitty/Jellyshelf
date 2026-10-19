import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { forgetSubs } from "@/lib/subtitles";
import { jellyfin } from "@/lib/clients/jellyfin";
import { qbittorrent } from "@/lib/clients/qbittorrent";
import { radarr } from "@/lib/clients/radarr";
import { sonarr } from "@/lib/clients/sonarr";
import { getSettings } from "@/lib/settings";

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

/** Delete what a request went to (see deleteTitle); null when it isn't in Sonarr/Radarr (any more), or they aren't set up. */
export async function deleteRequested(target: ManagedService, targetId: number, deleteFiles: boolean) {
  const s = await getSettings();
  if (!s[target].url || !s[target].apiKey) return null;
  const found = target === "sonarr" ? await sonarr(s.sonarr).seriesByTvdb(targetId) : await radarr(s.radarr).movieByTmdb(targetId);
  if (!found) return null;
  return { note: await deleteTitle(target, found.id!, deleteFiles) };
}

/** Torrents Sonarr/Radarr grabbed for a title (their ids are the torrent hashes; other clients' ids don't look like one). */
async function grabbedTorrents(service: ManagedService, id: number) {
  const s = await getSettings();
  const path = service === "sonarr" ? `/history/series?seriesId=${id}&eventType=1` : `/history/movie?movieId=${id}&eventType=1`;
  const grabs = await (service === "sonarr" ? sonarr(s.sonarr) : radarr(s.radarr)).call<{ downloadId?: string }[]>(path);
  return [...new Set(grabs.map((g) => g.downloadId ?? "").filter((h) => /^[0-9a-f]{40}$/i.test(h)))];
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
  if (!qbit) return null;
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
