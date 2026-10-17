import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, handle } from "@/lib/api";
import { apiUser } from "@/lib/auth";
import { pushScore } from "@/lib/ratings";

type Ctx = { params: Promise<{ id: string }> };

async function own(userId: number, id: number) {
  const [row] = await db
    .select()
    .from(schema.ratings)
    .where(and(eq(schema.ratings.id, id), eq(schema.ratings.userId, userId)));
  if (!row) throw new ApiError(404, "Rating not found");
  return row;
}

const body = z.object({
  /** Link (or re-link) to an AniList entry: an id or an anilist.co URL. */
  anilist: z.string().optional(),
  /** Push this rating's score to AniList. */
  push: z.boolean().optional(),
});

export function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await apiUser();
    const row = await own(user.id, Number((await params).id));
    const v = body.parse(await req.json());
    if (v.anilist !== undefined) {
      // Not just any number in it: a MyAnimeList link or an anilist.co/manga one would link some other title.
      const m = v.anilist.trim().match(/^(?:(?:https?:\/\/)?(?:www\.)?anilist\.co\/anime\/)?(\d+)(?:[/?#].*)?$/i);
      const anilistId = v.anilist.trim() === "" ? null : m ? Number(m[1]) : NaN;
      if (Number.isNaN(anilistId)) throw new ApiError(400, "Paste an AniList URL or id");
      await db.update(schema.ratings).set({ anilistId, updatedAt: new Date() }).where(eq(schema.ratings.id, row.id));
      row.anilistId = anilistId;
    }
    if (v.push) {
      if (!row.anilistId) throw new ApiError(400, "Link this rating to an AniList entry first");
      await pushScore(user, row.anilistId, row.total, true);
      await db.update(schema.ratings).set({ pushedToAnilist: true }).where(eq(schema.ratings.id, row.id));
    }
    return { ok: true };
  });
}

export function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await apiUser();
    const row = await own(user.id, Number((await params).id));
    await db.delete(schema.ratings).where(eq(schema.ratings.id, row.id));
    return { ok: true };
  });
}
