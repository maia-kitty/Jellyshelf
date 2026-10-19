import type { Media, Request } from "@/db/schema";
import { downloadQueues, progressFor } from "@/lib/downloads";
import { DownloadBar } from "./DownloadBar";

/** Under the hero's buttons: where a request is up to — waiting for approval, searching, or downloading. */
export async function LibraryStatus({ requests, media, inLibrary }: { requests: Request[]; media: Media | null | undefined; inLibrary: boolean }) {
  const approved = requests.find((r) => r.status === "approved");
  const download = approved && media ? progressFor(approved, media, await downloadQueues()) : null;
  if (download) return <DownloadBar d={download} className="max-w-md" />;
  const service = approved?.target === "radarr" ? "Radarr" : "Sonarr";
  if (approved && !inLibrary) return <p className="rise-in text-sm text-muted">Approved — {service} is looking for a release.</p>;
  if (requests.some((r) => r.status === "pending")) return <p className="rise-in text-sm text-muted">Requested — waiting for an admin to approve it.</p>;
  // Still requestable: hold the line a request will fill, so the hero (and everything under it) doesn't grow when it does.
  return inLibrary ? null : <div aria-hidden className="h-5" />;
}
