import { eq, inArray } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/db";
import type { IdMapping, Media, MediaStatus, Request } from "@/db/schema";
import { getSettings } from "@/lib/settings";
import { radarr, type RadarrMovie } from "@/lib/clients/radarr";
import { sonarr, type SonarrClient, type SonarrEpisode, type SonarrSeries, type SonarrSeasonStats } from "@/lib/clients/sonarr";
import { jellyfin } from "@/lib/clients/jellyfin";
import { episodesInRequest, syncEpisodeMonitoring } from "@/lib/requests/push";
import type { EpisodeRange } from "@/lib/mapping/resolve";

const RANK: Record<MediaStatus, number> = { unknown: 0, pending: 1, processing: 2, partially_available: 3, available: 4 };

function seasonStatus(stats: SonarrSeasonStats | undefined): MediaStatus | null {
  if (!stats || stats.episodeFileCount === 0) return null;
  return stats.episodeFileCount >= Math.max(stats.totalEpisodeCount, stats.episodeCount) ? "available" : "partially_available";
}

function episodesStatus(eps: SonarrEpisode[], closed: boolean): MediaStatus | null {
  const have = eps.filter((e) => e.hasFile).length;
  if (!have) return null;
  return have === eps.length && closed ? "available" : "partially_available";
}

/**
 * Ranges for every AniList entry sharing a TVDB season (or an absolute-numbered series),
 * derived from sibling episode offsets: an entry runs until the next sibling starts.
 */
export function rangesFromSiblings(siblings: Pick<IdMapping, "anilistId" | "episodeOffset">[]): Map<number, EpisodeRange> {
  const sorted = [...siblings].sort((a, b) => a.episodeOffset - b.episodeOffset);
  const out = new Map<number, EpisodeRange>();
  sorted.forEach((s, i) => {
    const next = sorted.slice(i + 1).find((n) => n.episodeOffset > s.episodeOffset);
    out.set(s.anilistId, { from: s.episodeOffset + 1, to: next ? next.episodeOffset : null });
  });
  return out;
}

export interface SyncReport {
  radarr?: string;
  sonarr?: string;
  jellyfin?: string;
  updatedMedia: number;
  completedRequests: number;
}

const g = globalThis as unknown as { __kitsuneSyncing?: Promise<SyncReport> };

/** Single-flight wrapper: concurrent triggers (cron + webhooks) share one run. */
export function runAvailabilitySync(): Promise<SyncReport> {
  return (g.__kitsuneSyncing ??= syncAvailability().finally(() => {
    g.__kitsuneSyncing = undefined;
  }));
}

async function syncAvailability(): Promise<SyncReport> {
  await ensureMigrated();
  const settings = await getSettings();
  const report: SyncReport = { updatedMedia: 0, completedRequests: 0 };

  const allMedia = await db.select().from(schema.media);
  const activeReqs = await db.select().from(schema.requests).where(inArray(schema.requests.status, ["pending", "approved"]));
  const observed = new Map<number, MediaStatus>();
  const extra = new Map<number, Partial<Media>>();
  const completed = new Set<number>();
  const upgrade = (id: number, s: MediaStatus | null) => {
    if (s && RANK[s] > RANK[observed.get(id) ?? "unknown"]) observed.set(id, s);
  };
  const patch = (id: number, p: Partial<Media>) => extra.set(id, { ...extra.get(id), ...p });
  const newAnime: (typeof schema.media.$inferInsert)[] = [];
  const knownAnime = new Set(allMedia.filter((m) => m.anilistId).map((m) => m.anilistId!));

  // ---------- Radarr ----------
  let movies = new Map<number, RadarrMovie>();
  if (settings.radarr.url && settings.radarr.apiKey) {
    try {
      movies = new Map((await radarr(settings.radarr).allMovies()).map((m) => [m.tmdbId, m]));
      report.radarr = `${movies.size} movies`;
    } catch (e) {
      report.radarr = `error: ${(e as Error).message}`;
    }
  }
  for (const m of allMedia) {
    const isMovie = m.kind === "movie" || (m.kind === "anime" && m.format === "MOVIE");
    const movie = isMovie && m.tmdbId ? movies.get(m.tmdbId) : undefined;
    if (!movie) continue;
    patch(m.id, { radarrId: movie.id });
    upgrade(m.id, movie.hasFile ? "available" : null);
  }
  for (const r of activeReqs) {
    if (r.status === "approved" && r.target === "radarr" && movies.get(r.targetId)?.hasFile) completed.add(r.id);
  }
  // Anime movies already in Radarr that nobody requested through us.
  const animeMovieIds = [...movies.values()].filter((m) => m.hasFile).map((m) => m.tmdbId);
  for (let i = 0; i < animeMovieIds.length; i += 500) {
    const maps = await db.select().from(schema.idMapping).where(inArray(schema.idMapping.tmdbMovieId, animeMovieIds.slice(i, i + 500)));
    for (const map of maps) {
      if (map.type !== "MOVIE" || knownAnime.has(map.anilistId)) continue;
      const mv = movies.get(map.tmdbMovieId!)!;
      knownAnime.add(map.anilistId);
      newAnime.push({ kind: "anime", anilistId: map.anilistId, tmdbId: mv.tmdbId, title: mv.title, format: "MOVIE", status: "available", radarrId: mv.id });
    }
  }

  // ---------- Sonarr ----------
  if (settings.sonarr.url && settings.sonarr.apiKey) {
    try {
      const api = sonarr(settings.sonarr);
      const series = new Map((await api.allSeries()).map((s) => [s.tvdbId, s]));
      report.sonarr = `${series.size} series`;
      await syncSonarr(api, series, allMedia, activeReqs, { upgrade, patch, completed, newAnime, knownAnime });
    } catch (e) {
      report.sonarr = `error: ${(e as Error).message}`;
    }
  }

  // ---------- Jellyfin ----------
  if (settings.jellyfin.url && settings.jellyfin.apiKey) {
    try {
      const items = await jellyfin(settings.jellyfin).libraryItems();
      report.jellyfin = `${items.length} items`;
      const byKey = new Map<string, string>();
      for (const it of items) {
        const p = it.ProviderIds ?? {};
        const kind = it.Type === "Movie" ? "movie" : "tv";
        if (p.Tmdb) byKey.set(`${kind}:${p.Tmdb}`, it.Id);
        if (p.Tvdb && kind === "tv") byKey.set(`tvdb:${p.Tvdb}`, it.Id);
        if (p.AniList) byKey.set(`anilist:${p.AniList}`, it.Id);
      }
      for (const m of allMedia) {
        const id =
          (m.kind !== "anime" && m.tmdbId && byKey.get(`${m.kind}:${m.tmdbId}`)) ||
          (m.kind === "anime" && m.anilistId && byKey.get(`anilist:${m.anilistId}`)) ||
          (m.kind === "anime" && m.format === "MOVIE" && m.tmdbId && byKey.get(`movie:${m.tmdbId}`)) ||
          (m.kind === "anime" && m.tvdbId && byKey.get(`tvdb:${m.tvdbId}`)) ||
          null;
        if (!id) continue;
        patch(m.id, { jellyfinItemId: id });
        // Jellyfin presence alone proves a movie is there; for series it proves "some of it".
        upgrade(m.id, m.kind === "movie" || m.format === "MOVIE" ? "available" : "partially_available");
      }
      // Library items we've never seen: create rows so discovery cards show them as available.
      const knownKeys = new Set(allMedia.filter((m) => m.kind !== "anime" && m.tmdbId).map((m) => `${m.kind}:${m.tmdbId}`));
      const fresh = items
        .filter((it) => it.ProviderIds?.Tmdb && !knownKeys.has(`${it.Type === "Movie" ? "movie" : "tv"}:${it.ProviderIds.Tmdb}`))
        .map((it) => ({
          kind: (it.Type === "Movie" ? "movie" : "tv") as "movie" | "tv",
          tmdbId: Number(it.ProviderIds!.Tmdb),
          tvdbId: it.ProviderIds?.Tvdb ? Number(it.ProviderIds.Tvdb) : null,
          title: it.Name,
          status: (it.Type === "Movie" ? "available" : "partially_available") as MediaStatus,
          jellyfinItemId: it.Id,
          lastSynced: new Date(),
        }));
      for (let i = 0; i < fresh.length; i += 200) {
        await db.insert(schema.media).values(fresh.slice(i, i + 200)).onConflictDoNothing();
      }
      report.updatedMedia += fresh.length;
    } catch (e) {
      report.jellyfin = `error: ${(e as Error).message}`;
    }
  }

  // ---------- write back ----------
  const reqsByMedia = new Map<number, Request[]>();
  for (const r of activeReqs) reqsByMedia.set(r.mediaId, [...(reqsByMedia.get(r.mediaId) ?? []), r]);
  for (const m of allMedia) {
    const reqs = (reqsByMedia.get(m.id) ?? []).filter((r) => !completed.has(r.id));
    const fallback: MediaStatus = reqs.some((r) => r.status === "approved")
      ? "processing"
      : reqs.some((r) => r.status === "pending")
        ? "pending"
        : "unknown";
    const obs = observed.get(m.id);
    const status = obs && RANK[obs] >= RANK.partially_available ? obs : fallback;
    const p = extra.get(m.id) ?? {};
    const changed = status !== m.status || Object.entries(p).some(([k, v]) => JSON.stringify((m as Record<string, unknown>)[k]) !== JSON.stringify(v));
    if (!changed) continue;
    await db.update(schema.media).set({ ...p, status, lastSynced: new Date(), updatedAt: new Date() }).where(eq(schema.media.id, m.id));
    report.updatedMedia++;
  }
  for (let i = 0; i < newAnime.length; i += 200) {
    await db.insert(schema.media).values(newAnime.slice(i, i + 200)).onConflictDoNothing();
  }
  report.updatedMedia += newAnime.length;
  if (completed.size) {
    await db.update(schema.requests).set({ status: "completed", updatedAt: new Date() }).where(inArray(schema.requests.id, [...completed]));
    report.completedRequests = completed.size;
  }
  return report;
}

interface SonarrCtx {
  upgrade: (id: number, s: MediaStatus | null) => void;
  patch: (id: number, p: Partial<Media>) => void;
  completed: Set<number>;
  newAnime: (typeof schema.media.$inferInsert)[];
  knownAnime: Set<number>;
}

async function syncSonarr(api: SonarrClient, series: Map<number, SonarrSeries>, allMedia: Media[], reqs: Request[], ctx: SonarrCtx) {
  const episodeCache = new Map<number, Promise<SonarrEpisode[]>>();
  const episodesOf = (s: SonarrSeries) => {
    if (!episodeCache.has(s.id!)) episodeCache.set(s.id!, api.episodes(s.id!));
    return episodeCache.get(s.id!)!;
  };

  // Approved requests: finish deferred episode monitoring, detect completion.
  for (const r of reqs) {
    if (r.status !== "approved" || r.target !== "sonarr") continue;
    const s = series.get(r.targetId);
    if (!s) continue;
    if (r.needsEpisodeSync) await syncEpisodeMonitoring(api, s, r).catch((e) => console.warn(`[sync] episode monitor ${r.id}:`, e.message));
    let done: boolean;
    if (r.episodeRanges?.length) {
      const eps = episodesInRequest(await episodesOf(s), r);
      done = eps.length > 0 && eps.every((e) => e.hasFile) && r.episodeRanges.every((x) => x.to !== null);
    } else if (r.seasons?.length) {
      done = r.seasons.every((n) => seasonStatus(s.seasons.find((x) => x.seasonNumber === n)?.statistics) === "available");
    } else {
      done = seasonStatus(s.statistics) === "available" && s.status === "ended";
    }
    if (done) ctx.completed.add(r.id);
  }

  // Plain TV rows: per-season status from Sonarr statistics.
  for (const m of allMedia) {
    if (m.kind !== "tv" || !m.tvdbId) continue;
    const s = series.get(m.tvdbId);
    if (!s) continue;
    const per: Record<string, MediaStatus> = {};
    for (const x of s.seasons) {
      const st = seasonStatus(x.statistics);
      if (x.seasonNumber > 0 && st) per[x.seasonNumber] = st;
    }
    ctx.patch(m.id, { sonarrId: s.id, seasonStatus: per });
    const real = s.seasons.filter((x) => x.seasonNumber > 0 && (x.statistics?.totalEpisodeCount ?? 0) > 0);
    const avail = real.filter((x) => per[x.seasonNumber] === "available").length;
    ctx.upgrade(m.id, avail && avail === real.length ? "available" : Object.keys(per).length ? "partially_available" : null);
  }

  // Anime: every AniList entry mapped onto a series that's in Sonarr.
  const tvdbIds = [...series.keys()];
  const animeById = new Map(allMedia.filter((m) => m.kind === "anime" && m.anilistId).map((m) => [m.anilistId!, m]));
  for (let i = 0; i < tvdbIds.length; i += 500) {
    const maps = await db.select().from(schema.idMapping).where(inArray(schema.idMapping.tvdbId, tvdbIds.slice(i, i + 500)));
    const byTvdb = new Map<number, IdMapping[]>();
    for (const map of maps) {
      if (map.type === "MOVIE" || map.tvdbSeason === null) continue;
      byTvdb.set(map.tvdbId!, [...(byTvdb.get(map.tvdbId!) ?? []), map]);
    }
    for (const [tvdbId, entries] of byTvdb) {
      const s = series.get(tvdbId)!;
      const groups = new Map<number, IdMapping[]>();
      for (const e of entries) groups.set(e.tvdbSeason!, [...(groups.get(e.tvdbSeason!) ?? []), e]);
      for (const [seasonNo, group] of groups) {
        const shared = group.length > 1 || seasonNo === -1 || group[0].episodeOffset > 0;
        const ranges = shared ? rangesFromSiblings(group) : null;
        const eps = shared ? await episodesOf(s) : [];
        for (const e of group) {
          let st: MediaStatus | null;
          if (!ranges) {
            st = seasonStatus(s.seasons.find((x) => x.seasonNumber === seasonNo)?.statistics);
          } else {
            const known = animeById.get(e.anilistId);
            const range = ranges.get(e.anilistId)!;
            // Prefer the real episode count if we know it (handles the last cour of an airing season).
            const to = known?.episodes ? range.from + known.episodes - 1 : range.to;
            const inRange = eps.filter((ep) => {
              const n = seasonNo === -1 ? ep.absoluteEpisodeNumber : ep.seasonNumber === seasonNo ? ep.episodeNumber : undefined;
              return n !== undefined && n >= range.from && (to === null || n <= to);
            });
            st = inRange.length ? episodesStatus(inRange, to !== null) : null;
          }
          const known = animeById.get(e.anilistId);
          if (known) {
            ctx.patch(known.id, { sonarrId: s.id });
            ctx.upgrade(known.id, st);
          } else if (st && !ctx.knownAnime.has(e.anilistId)) {
            ctx.knownAnime.add(e.anilistId);
            ctx.newAnime.push({
              kind: "anime",
              anilistId: e.anilistId,
              tvdbId,
              title: seasonNo > 0 ? `${s.title} (S${seasonNo})` : s.title,
              status: st,
              sonarrId: s.id,
              lastSynced: new Date(),
            });
          }
        }
      }
    }
  }
}
