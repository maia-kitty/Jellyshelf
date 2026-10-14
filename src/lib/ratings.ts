import { and, desc, eq } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/db";
import type { User } from "@/db/schema";
import { ApiError } from "./api";
import { anilistToken } from "./auth";
import { anilist, aniTitle } from "./clients/anilist";
import { fuzzyToday, listPatch } from "./listEntry";
import { total, validateScores, type ImportedRating } from "./rating";

/** The viewer's AniList credentials, or a 400 explaining they need to link AniList. */
export function requireAnilist(user: User) {
  const token = anilistToken(user);
  if (!token || !user.anilistId) throw new ApiError(400, "Link your AniList account first (sign in with AniList)");
  return { token, anilistId: user.anilistId };
}

/** Push a 0-100 score to AniList, optionally marking the entry completed (filling dates/progress like the site does). */
export async function pushScore(user: User, mediaId: number, score: number, markCompleted: boolean) {
  const { token, anilistId } = requireAnilist(user);
  const [list, media] = await Promise.all([anilist.userList(anilistId, token), anilist.media(mediaId)]);
  const current = list.get(mediaId);
  const episodes = media?.episodes ?? null;
  const patch = {
    ...(markCompleted && current?.status !== "COMPLETED" ? listPatch(current, episodes, { kind: "status", value: "COMPLETED" }) : {}),
    ...listPatch(current, episodes, { kind: "score", value: score }),
  };
  return anilist.updateListEntry(anilistId, token, mediaId, patch);
}

export async function listRatings(userId: number) {
  await ensureMigrated();
  return db.select().from(schema.ratings).where(eq(schema.ratings.userId, userId)).orderBy(desc(schema.ratings.ratedOn), desc(schema.ratings.id));
}

export async function latestRating(userId: number, anilistId: number) {
  await ensureMigrated();
  const [row] = await db
    .select()
    .from(schema.ratings)
    .where(and(eq(schema.ratings.userId, userId), eq(schema.ratings.anilistId, anilistId)))
    .orderBy(desc(schema.ratings.ratedOn), desc(schema.ratings.id))
    .limit(1);
  return row;
}

export async function createRating(
  user: User,
  input: { anilistId: number; scores: Record<string, unknown>; push: boolean; markCompleted: boolean },
) {
  let scores: Record<string, number>;
  try {
    scores = validateScores(input.scores);
  } catch (e) {
    throw new ApiError(400, (e as Error).message);
  }
  const media = await anilist.media(input.anilistId);
  if (!media) throw new ApiError(404, "Anime not found on AniList");
  const sum = total(scores);
  const t = fuzzyToday();
  const [row] = await db
    .insert(schema.ratings)
    .values({
      userId: user.id,
      anilistId: input.anilistId,
      title: aniTitle(media.title),
      scores,
      total: sum,
      ratedOn: `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`,
    })
    .returning();
  let pushError: string | null = null;
  if (input.push) {
    try {
      await pushScore(user, input.anilistId, sum, input.markCompleted);
      await db.update(schema.ratings).set({ pushedToAnilist: true }).where(eq(schema.ratings.id, row.id));
      row.pushedToAnilist = true;
    } catch (e) {
      pushError = e instanceof Error ? e.message : String(e);
    }
  }
  return { rating: row, pushError };
}

const top = async (q: string) => (await anilist.search(q, { perPage: 1 }).catch(() => null))?.media[0]?.id ?? null;

/** Best-effort AniList match for a hand-typed title. AniList search chokes on "S1" / "season 1" suffixes. */
async function matchTitle(title: string): Promise<number | null> {
  const hit = await top(title);
  if (hit) return hit;
  const stripped = title.replace(/\s*[-:]?\s*(s\d+|season\s*\d+|part\s*\d+|cour\s*\d+)\s*$/i, "").trim();
  return stripped && stripped !== title ? top(stripped) : null;
}

/**
 * Import rows from the script's CSV log. Rows without an AniList id can be matched by
 * searching the title and taking the top hit (shown on the ratings page so mismatches can be fixed).
 */
export async function importRatings(user: User, rows: ImportedRating[], autoMatch: boolean) {
  const matches = new Map<string, number | null>();
  let matched = 0;
  for (const r of rows) {
    if (r.anilistId || !autoMatch) continue;
    const key = r.title.toLowerCase();
    if (!matches.has(key)) matches.set(key, await matchTitle(r.title));
    r.anilistId = matches.get(key) ?? null;
    if (r.anilistId) matched++;
  }
  const existing = await listRatings(user.id);
  const seen = new Set(existing.map((e) => `${e.ratedOn}|${e.title}|${e.total}`));
  const fresh = rows.filter((r) => !seen.has(`${r.ratedOn}|${r.title}|${r.total}`));
  if (fresh.length) {
    await db.insert(schema.ratings).values(fresh.map((r) => ({ ...r, userId: user.id })));
  }
  return { imported: fresh.length, duplicates: rows.length - fresh.length, autoMatched: matched };
}
