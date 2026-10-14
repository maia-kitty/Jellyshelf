import { and, eq, inArray } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/db";
import type { Media, MediaKind, MediaStatus } from "@/db/schema";

export interface MediaKey {
  kind: MediaKind;
  tmdbId?: number | null;
  anilistId?: number | null;
}

export async function findMedia(key: MediaKey): Promise<Media | undefined> {
  await ensureMigrated();
  const where =
    key.kind === "anime"
      ? eq(schema.media.anilistId, key.anilistId!)
      : and(eq(schema.media.kind, key.kind), eq(schema.media.tmdbId, key.tmdbId!));
  const [row] = await db.select().from(schema.media).where(where);
  return row;
}

export async function upsertMedia(
  key: MediaKey,
  data: Partial<Omit<Media, "id" | "kind" | "createdAt">> & { title: string },
): Promise<Media> {
  const existing = await findMedia(key);
  if (existing) {
    const [row] = await db
      .update(schema.media)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.media.id, existing.id))
      .returning();
    return row;
  }
  const [row] = await db
    .insert(schema.media)
    .values({ kind: key.kind, tmdbId: key.tmdbId ?? null, anilistId: key.anilistId ?? null, ...data })
    .returning();
  return row;
}

export async function setMediaStatus(id: number, status: MediaStatus, extra: Partial<Media> = {}) {
  await db.update(schema.media).set({ status, ...extra, updatedAt: new Date() }).where(eq(schema.media.id, id));
}

/** Availability for a batch of cards. Keys: "movie:123", "tv:456", "anime:789". */
export async function statusMap(items: MediaKey[]): Promise<Record<string, MediaStatus>> {
  await ensureMigrated();
  const out: Record<string, MediaStatus> = {};
  const anime = items.filter((i) => i.kind === "anime" && i.anilistId).map((i) => i.anilistId!);
  const movies = items.filter((i) => i.kind === "movie" && i.tmdbId).map((i) => i.tmdbId!);
  const tv = items.filter((i) => i.kind === "tv" && i.tmdbId).map((i) => i.tmdbId!);
  const rows = [
    ...(anime.length ? await db.select().from(schema.media).where(inArray(schema.media.anilistId, anime)) : []),
    ...(movies.length
      ? await db.select().from(schema.media).where(and(eq(schema.media.kind, "movie"), inArray(schema.media.tmdbId, movies)))
      : []),
    ...(tv.length ? await db.select().from(schema.media).where(and(eq(schema.media.kind, "tv"), inArray(schema.media.tmdbId, tv))) : []),
  ];
  for (const r of rows) {
    const key = r.kind === "anime" ? `anime:${r.anilistId}` : `${r.kind}:${r.tmdbId}`;
    if (r.status !== "unknown") out[key] = r.status;
  }
  return out;
}

/** Seasons already covered by pending/approved/completed requests, for TV season pickers. */
export async function requestedSeasons(mediaId: number): Promise<number[]> {
  const rows = await db
    .select({ seasons: schema.requests.seasons })
    .from(schema.requests)
    .where(and(eq(schema.requests.mediaId, mediaId), inArray(schema.requests.status, ["pending", "approved", "completed"])));
  return [...new Set(rows.flatMap((r) => r.seasons ?? []))];
}

/** anilistId → media row, for anime pages listing several entries. */
export async function animeMediaMap(anilistIds: number[]): Promise<Map<number, Media & { requested: boolean }>> {
  if (!anilistIds.length) return new Map();
  await ensureMigrated();
  const rows = await db.select().from(schema.media).where(inArray(schema.media.anilistId, anilistIds));
  const reqs = rows.length
    ? await db
        .select({ mediaId: schema.requests.mediaId })
        .from(schema.requests)
        .where(
          and(
            inArray(
              schema.requests.mediaId,
              rows.map((r) => r.id),
            ),
            inArray(schema.requests.status, ["pending", "approved", "completed"]),
          ),
        )
    : [];
  const requested = new Set(reqs.map((r) => r.mediaId));
  return new Map(rows.map((r) => [r.anilistId!, { ...r, requested: requested.has(r.id) }]));
}
