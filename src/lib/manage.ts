import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { forgetSubs } from "@/lib/subtitles";
import { jellyfin } from "@/lib/clients/jellyfin";
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

/** Delete what a request went to (see deleteTitle); false when it isn't in Sonarr/Radarr (any more), or they aren't set up. */
export async function deleteRequested(target: ManagedService, targetId: number) {
  const s = await getSettings();
  if (!s[target].url || !s[target].apiKey) return false;
  const found = target === "sonarr" ? await sonarr(s.sonarr).seriesByTvdb(targetId) : await radarr(s.radarr).movieByTmdb(targetId);
  if (!found) return false;
  await deleteTitle(target, found.id!);
  return true;
}

/**
 * Remove a title for good: from Sonarr/Radarr with its files (Jellyfin is asked to rescan, so it goes from there too),
 * and its requests, so it can be requested again. Anime seasons sharing one Sonarr series all go with it.
 */
export async function deleteTitle(service: ManagedService, id: number) {
  const s = await getSettings();
  let key: number;
  if (service === "sonarr") {
    const api = sonarr(s.sonarr);
    key = (await api.series(id)).tvdbId;
    await api.call(`/series/${id}?deleteFiles=true&addImportListExclusion=false`, { method: "DELETE", timeoutMs: 60_000 });
  } else {
    const api = radarr(s.radarr);
    key = (await api.movie(id)).tmdbId;
    await api.call(`/movie/${id}?deleteFiles=true&addImportExclusion=false`, { method: "DELETE", timeoutMs: 60_000 });
  }
  // Left alone, the next sync would mark these failed ("Removed from Sonarr") instead.
  await db.delete(schema.requests).where(and(eq(schema.requests.target, service), eq(schema.requests.targetId, key)));
  await db
    .update(schema.media)
    .set({ status: "unknown", seasonStatus: null, jellyfinItemId: null, ...(service === "sonarr" ? { sonarrId: null } : { radarrId: null }) })
    .where(eq(service === "sonarr" ? schema.media.sonarrId : schema.media.radarrId, id));
  forgetSubs();
  if (s.jellyfin.url && s.jellyfin.apiKey) {
    await jellyfin(s.jellyfin)
      .refreshLibrary()
      .catch((e) => console.warn("[manage] Jellyfin rescan failed:", e instanceof Error ? e.message : e));
  }
}
