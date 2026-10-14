import { and, desc, eq } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/db";
import type { User } from "@/db/schema";
import { ApiError } from "./api";
import { anilistToken } from "./auth";
import { anilist, aniTitle } from "./clients/anilist";
import { matchTitle } from "./titleMatch";
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

/**
 * Import rows from the script's CSV log. Rows without an AniList id can be matched by
 * searching the title and taking the top hit (shown on the ratings page so mismatches can be fixed).
 */
export async function importRatings(user: User, rows: ImportedRating[], autoMatch: boolean) {
  const matches = new Map<string, number | null>();
  const token = anilistToken(user);
  const list = autoMatch && token && user.anilistId ? await anilist.userList(user.anilistId, token).catch(() => null) : null;
  let matched = 0;
  for (const r of rows) {
    if (r.anilistId || !autoMatch) continue;
    const key = `${r.title.toLowerCase()}|${r.total}`;
    if (!matches.has(key)) matches.set(key, await matchTitle(r.title, r.total, list, async (q) => (await anilist.search(q, { perPage: 1 }).catch(() => null))?.media[0]?.id ?? null));
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

export interface RatingRow {
  anilistId: number;
  title: string;
  cover: string | null;
  sub: string;
  /** Score on AniList (0-100); null when it isn't scored there. */
  anilistScore: number | null;
  /** Latest rubric breakdown for this anime, from Kitsune or a CSV import. */
  rubric: { id: number; scores: Record<string, number>; total: number; ratedOn: string; count: number } | null;
  /** When it was rated: the rubric date, else the AniList completion/update date. */
  date: string | null;
}

const iso = (d: { year: number | null; month: number | null; day: number | null }) =>
  d.year ? `${d.year}-${String(d.month ?? 1).padStart(2, "0")}-${String(d.day ?? 1).padStart(2, "0")}` : null;

/**
 * One row per rated anime. AniList is the source of truth for scores (one cached list request, shared with
 * the rest of the app); local rubric ratings add the per-category breakdown.
 * Local ratings that never reached AniList (e.g. no AniList account) are included too.
 */
export async function ratingsOverview(user: User): Promise<{ rows: RatingRow[]; unlinked: Awaited<ReturnType<typeof listRatings>> }> {
  const local = await listRatings(user.id); // newest first
  const latest = new Map<number, (typeof local)[number] & { count: number }>();
  for (const r of local) {
    if (!r.anilistId) continue;
    const seen = latest.get(r.anilistId);
    if (seen) seen.count++;
    else latest.set(r.anilistId, { ...r, count: 1 });
  }
  const rubricOf = (id: number) => {
    const r = latest.get(id);
    return r ? { id: r.id, scores: r.scores, total: r.total, ratedOn: r.ratedOn, count: r.count } : null;
  };

  const rows: RatingRow[] = [];
  const token = anilistToken(user);
  const list = token && user.anilistId ? await anilist.userList(user.anilistId, token) : null;
  for (const e of list?.values() ?? []) {
    if (!e.score && !latest.has(e.mediaId)) continue;
    const m = e.media;
    rows.push({
      anilistId: e.mediaId,
      title: aniTitle(m.title),
      cover: m.coverImage.large,
      sub: [m.seasonYear, m.format].filter(Boolean).join(" · "),
      anilistScore: e.score || null,
      rubric: rubricOf(e.mediaId),
      date: latest.get(e.mediaId)?.ratedOn ?? iso(e.completedAt) ?? new Date(e.updatedAt * 1000).toISOString().slice(0, 10),
    });
  }

  // Rubric ratings for anime that aren't on the AniList list at all.
  const missing = [...latest.keys()].filter((id) => !list?.has(id));
  for (let i = 0; i < missing.length; i += 50) {
    const media = new Map((await anilist.byIds(missing.slice(i, i + 50)).catch(() => [])).map((m) => [m.id, m]));
    for (const id of missing.slice(i, i + 50)) {
      const r = latest.get(id)!;
      const m = media.get(id);
      rows.push({
        anilistId: id,
        title: m ? aniTitle(m.title) : r.title,
        cover: m?.coverImage.large ?? null,
        sub: m ? [m.seasonYear, m.format].filter(Boolean).join(" · ") : "",
        anilistScore: null,
        rubric: rubricOf(id),
        date: r.ratedOn,
      });
    }
  }
  return { rows, unlinked: local.filter((r) => !r.anilistId) };
}
