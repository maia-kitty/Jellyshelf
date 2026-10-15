import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { apiUser } from "@/lib/auth";
import { NeedsJellyfinLogin, playSource } from "@/lib/playback";

const flags = <K extends string>(...keys: K[]) => z.object(Object.fromEntries(keys.map((k) => [k, z.boolean()])) as Record<K, z.ZodBoolean>);
const body = z.object({
  caps: z.object({
    video: flags("h264", "hevc", "av1", "vp9"),
    audio: flags("aac", "mp3", "opus", "flac", "ac3", "eac3"),
    mkv: z.boolean(),
    nativeHls: z.boolean(),
    maxChannels: z.number().int().min(1).max(8),
  }),
  audioIndex: z.number().int().optional(),
  subtitleIndex: z.number().int().optional(),
  maxBitrate: z.number().int().positive().optional(),
  noDirectPlay: z.boolean().optional(),
});

type Ctx = { params: Promise<{ itemId: string }> };

/** How to play a Jellyfin item in this browser: a relay URL (direct file or HLS) plus its tracks. */
export function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await apiUser();
    const itemId = (await params).itemId;
    if (!/^[0-9a-f-]{32,36}$/i.test(itemId)) throw new ApiError(400, "Bad item id");
    try {
      return await playSource(user, itemId, body.parse(await req.json()));
    } catch (e) {
      if (e instanceof NeedsJellyfinLogin) throw new ApiError(401, e.message);
      throw e;
    }
  });
}
