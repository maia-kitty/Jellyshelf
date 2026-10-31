import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { Media, Request, User } from "@/db/schema";
import { ApiError } from "@/lib/api";
import { anilistToken } from "@/lib/auth";
import { anilist, anilistManga, aniTitle } from "@/lib/clients/anilist";
import { tmdbClient, tmdbImage } from "@/lib/clients/tmdb";
import { resolveAnime } from "@/lib/mapping";
import { describeTarget, type EpisodeRange } from "@/lib/mapping/resolve";
import { getSettings } from "@/lib/settings";
import { upsertMedia } from "@/lib/media";
import { notifyAdmins } from "@/lib/notify";
import { decideRequest } from "./decide";

/** Only these episodes (1-based, inclusive) of a single season / AniList entry. */
const episodes = z
  .object({ from: z.number().int().min(1), to: z.number().int().min(1) })
  .refine((r) => r.to >= r.from, "The last episode comes before the first");

export const createRequestInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("movie"), tmdbId: z.number().int().positive() }),
  z
    .object({ kind: z.literal("tv"), tmdbId: z.number().int().positive(), seasons: z.array(z.number().int().min(0)).min(1), episodes: episodes.optional() })
    .refine((r) => !r.episodes || r.seasons.length === 1, "Pick episodes from one season at a time"),
  /** One or more AniList entries, e.g. a single season or a whole sequel chain. */
  z
    .object({ kind: z.literal("anime"), anilistIds: z.array(z.number().int().positive()).min(1).max(25), episodes: episodes.optional(), dub: z.boolean().optional() })
    .refine((r) => !r.episodes || r.anilistIds.length === 1, "Pick episodes from one entry at a time"),
  /** A manga for Mangarr: every chapter, or from `startChapter` on. */
  z.object({ kind: z.literal("manga"), anilistId: z.number().int().positive(), startChapter: z.number().min(0).max(100_000).optional() }),
]);
export type CreateRequestInput = z.infer<typeof createRequestInput>;

const ACTIVE = ["pending", "approved", "completed"] as const;

/** Active requests that cover the whole season/entry (a picked episode range doesn't). */
async function activeRequests(mediaId: number) {
  return (await db
    .select()
    .from(schema.requests)
    .where(and(eq(schema.requests.mediaId, mediaId), inArray(schema.requests.status, [...ACTIVE])))).filter((r) => !r.partial);
}

function autoApproves(user: User, kind: Media["kind"]) {
  if (user.role === "admin") return true;
  return kind === "movie" ? user.autoApproveMovie : kind === "tv" ? user.autoApproveTv : kind === "manga" ? user.autoApproveManga : user.autoApproveAnime;
}

async function insertRequest(user: User, media: Media, values: Omit<typeof schema.requests.$inferInsert, "mediaId" | "userId">) {
  const [req] = await db
    .insert(schema.requests)
    .values({ ...values, mediaId: media.id, userId: user.id })
    .returning();
  if (media.status === "unknown") await db.update(schema.media).set({ status: "pending" }).where(eq(schema.media.id, media.id));
  if (autoApproves(user, media.kind)) return decideRequest(req.id, user, "approve");
  return req;
}

export interface CreateResult {
  created: Request[];
  skipped: { id: number; reason: string }[];
}

export async function createRequests(user: User, input: CreateRequestInput): Promise<CreateResult> {
  const result = await create(user, input);
  // One notification for what one click asked for (an anime's whole sequel chain, say), not one per request.
  const waiting = result.created.filter((r) => r.status === "pending").map((r) => r.mediaId);
  if (waiting.length) {
    const titles = (await db.select({ title: schema.media.title }).from(schema.media).where(inArray(schema.media.id, waiting))).map((m) => m.title);
    void notifyAdmins({ title: "New request", message: `${titles.join(", ")}, from ${user.displayName}`, path: "/requests", tags: ["inbox_tray"] });
  }
  return result;
}

async function create(user: User, input: CreateRequestInput): Promise<CreateResult> {
  if (input.kind === "movie") {
    const m = await tmdbClient.movie(input.tmdbId);
    const media = await upsertMedia(
      { kind: "movie", tmdbId: m.id },
      { title: m.title, poster: tmdbImage(m.poster_path) },
    );
    if ((await activeRequests(media.id)).length || media.status === "available") {
      throw new ApiError(409, "Already requested or available");
    }
    return { created: [await insertRequest(user, media, { target: "radarr", targetId: m.id })], skipped: [] };
  }

  if (input.kind === "tv") {
    const tv = await tmdbClient.tv(input.tmdbId);
    const tvdbId = tv.external_ids?.tvdb_id;
    if (!tvdbId) throw new ApiError(422, "This show has no TVDB id on TMDB, so Sonarr can't add it");
    const media = await upsertMedia({ kind: "tv", tmdbId: tv.id }, { title: tv.name, poster: tmdbImage(tv.poster_path), tvdbId });
    const taken = new Set((await activeRequests(media.id)).flatMap((r) => r.seasons ?? []));
    const seasons = input.seasons.filter((s) => !taken.has(s));
    if (!seasons.length) throw new ApiError(409, input.episodes ? "That whole season is already requested" : "Those seasons are already requested");
    const picked = input.episodes ? { episodeRanges: [input.episodes], partial: true } : {};
    return {
      created: [await insertRequest(user, media, { target: "sonarr", targetId: tvdbId, seasons, ...picked })],
      skipped: [],
    };
  }

  if (input.kind === "manga") {
    const m = await anilistManga.media(input.anilistId);
    if (!m) throw new ApiError(404, "Not found on AniList");
    const media = await upsertMedia(
      { kind: "manga", anilistId: m.id },
      { title: aniTitle(m.title), poster: m.coverImage.extraLarge ?? m.coverImage.large, format: m.format },
    );
    const startChapter = input.startChapter || null;
    // Another request may reach further back (chapters before an earlier "from chapter N"); one that doesn't is a repeat.
    const active = await activeRequests(media.id);
    if (active.length && (startChapter ?? 0) >= Math.min(...active.map((r) => r.startChapter ?? 0))) {
      throw new ApiError(409, "Already requested");
    }
    console.info(`[request] ${user.displayName} → ${media.title} (manga${startChapter ? `, from chapter ${startChapter}` : ""})`);
    return { created: [await insertRequest(user, media, { target: "mangarr", targetId: m.id, startChapter })], skipped: [] };
  }

  // Anime: one request per AniList entry so each season/cour tracks its own status.
  const result: CreateResult = { created: [], skipped: [] };
  const { anilist: anilistSettings } = await getSettings();
  const token = anilistToken(user);
  const userList = token && user.anilistId ? await anilist.userList(user.anilistId, token).catch(() => null) : null;

  for (const id of input.anilistIds) {
    const entry = await anilist.media(id);
    if (!entry) {
      result.skipped.push({ id, reason: "Not found on AniList" });
      continue;
    }
    const { target } = await resolveAnime(entry);
    if (target.service === "unmapped") {
      result.skipped.push({ id, reason: target.reason });
      continue;
    }
    const media = await upsertMedia(
      { kind: "anime", anilistId: id },
      {
        title: aniTitle(entry.title),
        poster: entry.coverImage.extraLarge ?? entry.coverImage.large,
        format: entry.format,
        episodes: entry.episodes,
        ...(target.service === "radarr" ? { tmdbId: target.tmdbId } : { tvdbId: target.tvdbId }),
      },
    );
    if ((await activeRequests(media.id)).length || media.status === "available") {
      result.skipped.push({ id, reason: "Already requested or available" });
      continue;
    }
    const req = await insertRequest(
      user,
      media,
      target.service === "radarr"
        ? { target: "radarr", targetId: target.tmdbId, dub: !!input.dub }
        : {
            target: "sonarr",
            dub: !!input.dub,
            targetId: target.tvdbId,
            absolute: target.absolute,
            seasons: target.season !== null ? [target.season] : null,
            episodeRanges: input.episodes ? [shift(input.episodes, target.episodes)] : target.episodes ? [target.episodes] : null,
            partial: !!input.episodes,
          },
    );
    result.created.push(req);

    // Write back: put it on the requester's Planning list unless it's already on their list.
    if (anilistSettings.writeBack && token && user.anilistId && !userList?.has(id)) {
      await anilist.saveListEntry(user.anilistId, token, id, "PLANNING").catch((e) => {
        console.warn(`[anilist] write-back failed for ${id}:`, e instanceof Error ? e.message : e);
      });
    }
    console.info(`[request] ${user.displayName} → ${aniTitle(entry.title)}: ${describeTarget(target)}`);
  }
  if (!result.created.length && result.skipped.length) {
    throw new ApiError(409, result.skipped.map((s) => s.reason).join("; "));
  }
  return result;
}

/** An entry's own episode numbers (1 = its first) as the numbers Sonarr knows them by: in its TVDB season, or absolute. */
export function shift(picked: { from: number; to: number }, entry: EpisodeRange | null): EpisodeRange {
  const before = (entry?.from ?? 1) - 1;
  return { from: before + picked.from, to: before + picked.to };
}
