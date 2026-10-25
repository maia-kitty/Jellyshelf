import { eq, or } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/db";
import type { IdMapping } from "@/db/schema";
import { fetchJson } from "@/lib/clients/http";
import type { AniTitle } from "@/lib/clients/anilist";
import { tmdbClient } from "@/lib/clients/tmdb";
import { norm } from "@/lib/titleMatch";
import { resolveAnimeTarget, type AniEntryInfo, type AnimeTarget } from "./resolve";
import { ANIME_LISTS_URL, FRIBB_URL, buildMappingRows, parseAnimeListsXml, type FribbEntry } from "./sources";

export async function refreshMappings() {
  await ensureMigrated();
  const [fribb, xml] = await Promise.all([
    fetchJson<FribbEntry[]>(FRIBB_URL, { timeoutMs: 120_000 }),
    fetch(ANIME_LISTS_URL, { signal: AbortSignal.timeout(120_000), cache: "no-store" }).then((r) => {
      if (!r.ok) throw new Error(`anime-lists: HTTP ${r.status}`);
      return r.text();
    }),
  ]);
  const rows = buildMappingRows(fribb, parseAnimeListsXml(xml));
  await db.transaction(async (tx) => {
    await tx.delete(schema.idMapping);
    for (let i = 0; i < rows.length; i += 500) await tx.insert(schema.idMapping).values(rows.slice(i, i + 500));
  });
  return rows.length;
}

export async function mappingCount() {
  await ensureMigrated();
  const r = await db.$count(schema.idMapping);
  return r;
}

/** The effective mapping for an AniList id: admin override first, then the generated table. */
export async function getMapping(anilistId: number): Promise<IdMapping | undefined> {
  await ensureMigrated();
  const [base] = await db.select().from(schema.idMapping).where(eq(schema.idMapping.anilistId, anilistId));
  const [ovr] = await db.select().from(schema.idMappingOverride).where(eq(schema.idMappingOverride.anilistId, anilistId));
  if (!ovr) return base;
  return {
    anilistId,
    anidbId: base?.anidbId ?? null,
    malId: base?.malId ?? null,
    imdbId: base?.imdbId ?? null,
    type: base?.type ?? null,
    tmdbTvId: base?.tmdbTvId ?? null,
    tvdbId: ovr.tvdbId,
    tmdbMovieId: ovr.tmdbMovieId,
    tvdbSeason: ovr.tvdbSeason,
    episodeOffset: ovr.episodeOffset,
  };
}

export async function siblingsOf(tvdbId: number) {
  return db.select().from(schema.idMapping).where(eq(schema.idMapping.tvdbId, tvdbId));
}

/**
 * A film's TMDB id when the lists only file it as a TVDB special: from its IMDb id, or else a single TMDB film with
 * exactly its English or romaji title from the same year.
 */
async function filmTmdbId(mapping: IdMapping, entry: { title?: AniTitle; seasonYear?: number | null }) {
  const byImdb = mapping.imdbId ? await tmdbClient.movieByImdb(mapping.imdbId).catch(() => null) : null;
  if (byImdb || !entry.seasonYear) return byImdb;
  for (const name of [entry.title?.english, entry.title?.romaji]) {
    if (!name) continue;
    const found = await tmdbClient.searchMovie(name, entry.seasonYear).catch(() => null);
    const hits = found?.results.filter((r) => [r.title, r.original_title].some((t) => norm(t) === norm(name))) ?? [];
    if (hits.length === 1) return hits[0].id;
  }
  return null;
}

/** Where an AniList entry goes. Pass its title and year (any AniList card has them) so a film can be found on TMDB. */
export async function resolveAnime(
  entry: AniEntryInfo & { title?: AniTitle; seasonYear?: number | null },
): Promise<{ target: AnimeTarget; mapping: IdMapping | undefined }> {
  let mapping = await getMapping(entry.id);
  // Filed as a special, Sonarr can rarely match a release to a film (they're named like films, not episodes), so
  // send it to Radarr whenever TMDB has it. Not when an admin has set the mapping by hand.
  if (entry.format === "MOVIE" && mapping && !mapping.tmdbMovieId && !(await db.$count(schema.idMappingOverride, eq(schema.idMappingOverride.anilistId, entry.id)))) {
    const tmdbMovieId = await filmTmdbId(mapping, entry);
    if (tmdbMovieId) mapping = { ...mapping, tmdbMovieId };
  }
  const siblings = mapping?.tvdbId ? await siblingsOf(mapping.tvdbId) : [];
  return { target: resolveAnimeTarget(entry, mapping, siblings), mapping };
}

/** Reverse lookup: which AniList entries belong to a TMDB/TVDB title (to show AniList status on TMDB pages). */
export async function anilistIdsFor(opts: { tvdbId?: number | null; tmdbMovieId?: number | null; tmdbTvId?: number | null; imdbId?: string | null }) {
  await ensureMigrated();
  const conds = [];
  if (opts.tvdbId) conds.push(eq(schema.idMapping.tvdbId, opts.tvdbId));
  if (opts.tmdbMovieId) conds.push(eq(schema.idMapping.tmdbMovieId, opts.tmdbMovieId));
  if (opts.tmdbTvId) conds.push(eq(schema.idMapping.tmdbTvId, opts.tmdbTvId));
  // Films the lists only file as a TVDB special have no TMDB id there, but mostly an IMDb one.
  if (opts.imdbId) conds.push(eq(schema.idMapping.imdbId, opts.imdbId));
  if (!conds.length) return [];
  return db.select().from(schema.idMapping).where(or(...conds));
}

