import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { apiUser } from "@/lib/auth";
import { NeedsJellyfinLogin, report } from "@/lib/playback";

const body = z.object({
  event: z.enum(["start", "progress", "stop"]),
  itemId: z.string().regex(/^[0-9a-f-]{32,36}$/i),
  mediaSourceId: z.string().max(64),
  playSessionId: z.string().max(64),
  playMethod: z.enum(["DirectPlay", "DirectStream", "Transcode"]),
  position: z.number().min(0),
  duration: z.number().min(0),
  paused: z.boolean(),
  audioIndex: z.number().int().nullable(),
  subtitleIndex: z.number().int().nullable(),
});

/** Player → Jellyfin playback reporting (resume points, watched state, Now Playing), plus the AniList sync. */
export function POST(req: Request) {
  return handle(async () => {
    const user = await apiUser();
    // sendBeacon (on closing the tab) posts text/plain.
    const r = body.parse(JSON.parse(await req.text()));
    try {
      return await report(user, r);
    } catch (e) {
      if (e instanceof NeedsJellyfinLogin) throw new ApiError(401, e.message);
      throw e;
    }
  });
}
