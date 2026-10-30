import type { Media, Request } from "@/db/schema";
import { downloadQueues, progressFor } from "@/lib/downloads";
import { DownloadBar } from "./DownloadBar";

/** Under the hero's buttons: where a request is up to — waiting for approval, searching, or downloading. */
export async function LibraryStatus({ requests, media, inLibrary, anime }: { requests: Request[]; media: Media | null | undefined; inLibrary: boolean; anime?: boolean }) {
  const approved = requests.find((r) => r.status === "approved");
  const download = approved && media ? progressFor(approved, media, await downloadQueues()) : null;
  if (download) return <DownloadBar d={download} className="max-w-md" />;
  const service = approved?.target === "radarr" ? "Radarr" : "Sonarr";
  if (inLibrary) return null;
  // Not here yet: point at FMHY's streaming list for anyone who'd rather not wait.
  const elsewhere = (
    <a className="text-accent hover:underline" href={`https://fmhy.net/video#${anime ? "anime-streaming" : "streaming-sites"}`} target="_blank" rel="noreferrer">
      Don&apos;t want to wait?
    </a>
  );
  if (approved) return <p className="rise-in text-sm text-muted">Approved — {service} is looking for a release. {elsewhere}</p>;
  if (requests.some((r) => r.status === "pending")) return <p className="rise-in text-sm text-muted">Requested — waiting for an admin to approve it. {elsewhere}</p>;
  // Still requestable: the link holds the line a request will fill, so the hero (and everything under it) doesn't grow when it does.
  return <p className="text-sm">{elsewhere}</p>;
}
