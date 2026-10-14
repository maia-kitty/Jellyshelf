import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handle } from "@/lib/api";
import { apiUser } from "@/lib/auth";

type Ctx = { params: Promise<{ anilistId: string }> };

const body = z.object({
  tvdbId: z.number().int().positive().nullable(),
  tmdbMovieId: z.number().int().positive().nullable(),
  tvdbSeason: z.number().int().min(-1).nullable(),
  episodeOffset: z.number().int().min(0).default(0),
});

/** Admin override for a wrong/missing AniList → TVDB/TMDB mapping. */
export function PUT(req: Request, { params }: Ctx) {
  return handle(async () => {
    await apiUser({ admin: true });
    const anilistId = Number((await params).anilistId);
    const v = body.parse(await req.json());
    await db
      .insert(schema.idMappingOverride)
      .values({ anilistId, ...v })
      .onConflictDoUpdate({ target: schema.idMappingOverride.anilistId, set: { ...v, updatedAt: new Date() } });
    return { ok: true };
  });
}

export function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    await apiUser({ admin: true });
    await db.delete(schema.idMappingOverride).where(eq(schema.idMappingOverride.anilistId, Number((await params).anilistId)));
    return { ok: true };
  });
}
