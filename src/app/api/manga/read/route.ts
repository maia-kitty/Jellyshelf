import { z } from "zod";
import { handle } from "@/lib/api";
import { apiUser } from "@/lib/auth";
import { readChapter } from "@/lib/mangaProgress";

const body = z.object({ anilistId: z.number().int().positive(), chapter: z.number().min(0).max(100_000) });

/** The reader got to the end of a chapter: AniList progress follows (when the reader's account is linked). */
export function POST(req: Request) {
  return handle(async () => {
    const user = await apiUser();
    const { anilistId, chapter } = body.parse(await req.json());
    return { anilist: await readChapter(user, anilistId, chapter) };
  });
}
