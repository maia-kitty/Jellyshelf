import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { apiUser } from "@/lib/auth";
import { anilist, anilistManga } from "@/lib/clients/anilist";
import { listPatch } from "@/lib/listEntry";
import { requireAnilist } from "@/lib/ratings";
import { viewerToday } from "@/lib/today";

const STATUS = z.enum(["CURRENT", "PLANNING", "COMPLETED", "DROPPED", "PAUSED", "REPEATING"]);
const body = z.object({
  mediaId: z.number().int().positive(),
  /** Manga entries count chapters; the default is anime (episodes). */
  type: z.enum(["anime", "manga"]).default("anime"),
  change: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("progress"), value: z.number().int().min(0).max(10000) }),
    z.object({ kind: z.literal("status"), value: STATUS }),
    z.object({ kind: z.literal("score"), value: z.number().min(0).max(100) }),
  ]),
});

/** Edit the viewer's own AniList entry: progress, status or score. */
export function PATCH(req: Request) {
  return handle(async () => {
    const user = await apiUser();
    const { token, anilistId } = requireAnilist(user);
    const { mediaId, change, type } = body.parse(await req.json());
    if (type === "manga") {
      const [list, manga] = await Promise.all([anilistManga.userList(anilistId, token), anilistManga.media(mediaId)]);
      if (!manga) throw new ApiError(404, "Manga not found");
      // AniList only knows the chapter count of a finished manga; a running one has no cap.
      const total = manga.status === "FINISHED" ? manga.chapters : null;
      const patch = listPatch(list.get(mediaId), total, change, await viewerToday());
      return anilistManga.updateList(anilistId, token, mediaId, patch);
    }
    const [list, media] = await Promise.all([anilist.userList(anilistId, token), anilist.media(mediaId)]);
    if (!media) throw new ApiError(404, "Anime not found");
    // For airing shows, cap progress at what has actually aired.
    const aired = media.nextAiringEpisode ? media.nextAiringEpisode.episode - 1 : null;
    const episodes = media.episodes ?? aired;
    const patch = listPatch(list.get(mediaId), media.episodes ?? null, change, await viewerToday());
    if (patch.progress !== undefined && episodes) patch.progress = Math.min(patch.progress, episodes);
    return anilist.updateListEntry(anilistId, token, mediaId, patch);
  });
}

export function DELETE(req: Request) {
  return handle(async () => {
    const user = await apiUser();
    const { token, anilistId } = requireAnilist(user);
    const url = new URL(req.url);
    const mediaId = Number(url.searchParams.get("mediaId"));
    const list = url.searchParams.get("type") === "manga" ? anilistManga.userList(anilistId, token) : anilist.userList(anilistId, token);
    const entry = (await list).get(mediaId);
    if (!entry) throw new ApiError(404, "Not on your list");
    await anilist.deleteListEntry(anilistId, token, entry.id);
    return { ok: true };
  });
}
