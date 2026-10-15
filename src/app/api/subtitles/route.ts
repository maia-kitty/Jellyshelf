import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { apiUser } from "@/lib/auth";
import { bazarrApi, canFixSubs, forgetSubs, seriesSubs } from "@/lib/subtitles";

const target = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("movie"), id: z.number().int() }),
  z.object({ kind: z.literal("series"), id: z.number().int(), episodeId: z.number().int().optional() }),
]);

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("search-missing"), target }),
  z.object({ action: z.literal("candidates"), target }),
  z.object({
    action: z.literal("download"),
    target,
    candidate: z.object({
      provider: z.string(),
      subtitle: z.string(),
      hearing_impaired: z.string(),
      forced: z.string(),
      original_format: z.string(),
    }),
  }),
]);

/** Search for missing subtitles, list manual-search candidates, or download one of them. */
export function POST(req: Request) {
  return handle(async () => {
    const user = await apiUser();
    const b = body.parse(await req.json());
    const api = await bazarrApi();
    if (!api) throw new ApiError(400, "Bazarr is not configured");
    const t = b.target;
    if (!(await canFixSubs(user, t))) throw new ApiError(403, "Not allowed");

    if (b.action === "search-missing") {
      await api.searchMissing(t.kind, t.id);
      forgetSubs();
      return { ok: true };
    }

    // Manual search and download work on one file: an episode of this series, or the movie.
    let fileId = t.id;
    if (t.kind === "series") {
      if (!t.episodeId) throw new ApiError(400, "Which episode?");
      const eps = await seriesSubs(t.id);
      if (!eps?.some((e) => e.sonarrEpisodeId === t.episodeId)) throw new ApiError(404, "Bazarr doesn't have that episode");
      fileId = t.episodeId;
    }
    if (b.action === "candidates") {
      const list = await api.candidates(t.kind, fileId);
      return list.sort((x, y) => y.score - x.score).slice(0, 100);
    }
    await api.download(t.kind, { seriesId: t.id, id: fileId }, b.candidate);
    forgetSubs();
    return { ok: true };
  });
}
