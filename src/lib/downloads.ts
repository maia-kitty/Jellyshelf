import type { Media, Request } from "@/db/schema";
import type { QueueRecord } from "@/lib/clients/arr";
import { radarr } from "@/lib/clients/radarr";
import { sonarr } from "@/lib/clients/sonarr";
import { cached } from "@/lib/cache";
import { getSettings } from "@/lib/settings";

export interface DownloadProgress {
  /** 0–1 across everything of this request that's in the queue. */
  progress: number;
  /** Seconds until the slowest item finishes, if the client knows. */
  secondsLeft: number | null;
  items: number;
  state: "downloading" | "queued" | "importing" | "stuck";
  message?: string;
}

/** Both download queues, shared by everyone viewing for a few seconds. A service that's down just has no queue. */
export function downloadQueues() {
  return cached("downloads:queues", 5, async () => {
    const s = await getSettings();
    const [son, rad] = await Promise.all([
      s.sonarr.url && s.sonarr.apiKey ? sonarr(s.sonarr).queue("&includeEpisode=true").catch(() => []) : [],
      s.radarr.url && s.radarr.apiKey ? radarr(s.radarr).queue().catch(() => []) : [],
    ]);
    return { sonarr: son, radarr: rad };
  });
}

/** "1.02:03:04" / "02:03:04" → seconds */
export function parseTimeleft(t?: string): number | null {
  const m = t?.match(/^(?:(\d+)\.)?(\d+):(\d+):(\d+)/);
  if (!m) return null;
  const [, d, h, min, sec] = m;
  return Number(d ?? 0) * 86400 + Number(h) * 3600 + Number(min) * 60 + Number(sec);
}

type Scope = Pick<Request, "absolute" | "seasons" | "episodeRanges">;

/** Is this queued episode part of what the request asked for? */
export function inScope(ep: NonNullable<QueueRecord["episode"]>, req: Scope) {
  const ranges = req.episodeRanges ?? [];
  if (req.absolute) {
    if (!ranges.length) return true; // whole series
    const n = ep.absoluteEpisodeNumber;
    return n !== undefined && ranges.some((r) => n >= r.from && (r.to === null || n <= r.to));
  }
  if (!req.seasons?.length) return true;
  if (!req.seasons.includes(ep.seasonNumber)) return false;
  return !ranges.length || ranges.some((r) => ep.episodeNumber >= r.from && (r.to === null || ep.episodeNumber <= r.to));
}

export function progressFor(req: Request & Scope, media: Pick<Media, "sonarrId" | "radarrId">, queues: { sonarr: QueueRecord[]; radarr: QueueRecord[] }): DownloadProgress | null {
  const records =
    req.target === "radarr"
      ? media.radarrId
        ? queues.radarr.filter((r) => r.movieId === media.radarrId)
        : []
      : media.sonarrId
        ? queues.sonarr.filter((r) => r.seriesId === media.sonarrId && (!r.episode || inScope(r.episode, req)))
        : [];
  if (!records.length) return null;

  // Season packs show up once per episode with the same download; count each download once for size.
  const downloads = [...new Map(records.map((r) => [r.id, r])).values()];
  const size = downloads.reduce((a, r) => a + (r.size || 0), 0);
  const left = downloads.reduce((a, r) => a + (r.sizeleft || 0), 0);
  const secs = downloads.map((r) => parseTimeleft(r.timeleft)).filter((x): x is number => x !== null);

  const stuck = records.find((r) => r.trackedDownloadStatus === "warning" || r.trackedDownloadStatus === "error" || r.status === "failed");
  const importing = records.every((r) => r.trackedDownloadState === "importPending" || r.trackedDownloadState === "importing");
  const downloading = records.some((r) => r.status === "downloading");
  return {
    progress: size ? Math.min(1, Math.max(0, (size - left) / size)) : 0,
    secondsLeft: secs.length ? Math.max(...secs) : null,
    items: records.length,
    state: stuck ? "stuck" : importing ? "importing" : downloading ? "downloading" : "queued",
    message: stuck ? (stuck.errorMessage ?? stuck.statusMessages?.flatMap((m) => m.messages)[0]) : undefined,
  };
}
