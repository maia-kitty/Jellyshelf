import { eq, or } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/db";
import type { IdMapping } from "@/db/schema";
import { fetchJson } from "@/lib/clients/http";
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

export async function resolveAnime(entry: AniEntryInfo): Promise<{ target: AnimeTarget; mapping: IdMapping | undefined }> {
  const mapping = await getMapping(entry.id);
  const siblings = mapping?.tvdbId ? await siblingsOf(mapping.tvdbId) : [];
  return { target: resolveAnimeTarget(entry, mapping, siblings), mapping };
}

/** Reverse lookup: which AniList entries belong to a TMDB/TVDB title (to show AniList status on TMDB pages). */
export async function anilistIdsFor(opts: { tvdbId?: number | null; tmdbMovieId?: number | null; tmdbTvId?: number | null }) {
  await ensureMigrated();
  const conds = [];
  if (opts.tvdbId) conds.push(eq(schema.idMapping.tvdbId, opts.tvdbId));
  if (opts.tmdbMovieId) conds.push(eq(schema.idMapping.tmdbMovieId, opts.tmdbMovieId));
  if (opts.tmdbTvId) conds.push(eq(schema.idMapping.tmdbTvId, opts.tmdbTvId));
  if (!conds.length) return [];
  return db.select().from(schema.idMapping).where(or(...conds));
}

