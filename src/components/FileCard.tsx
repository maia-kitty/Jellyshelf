import type { User } from "@/db/schema";
import type { MovieLibraryInfo } from "@/lib/episodes";
import { canFixSubs } from "@/lib/subtitles";
import { langName } from "@/lib/langs";
import { SubsBar } from "./Subtitles";
import { DownloadButton } from "./DownloadButton";
import { videoDownload } from "@/lib/appDownloads";

const gb = (bytes: number) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`);

/** One labelled fact; cards lay these out in a grid. */
export function Tile({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="mb-1 text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

export function Langs({ codes, empty = "—" }: { codes: string[]; empty?: string }) {
  if (!codes.length) return <span className="text-muted">{empty}</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {codes.map((c) => (
        <span key={c} className="rounded-md bg-panel-2 px-1.5 py-0.5 text-xs" title={langName(c)}>
          {langName(c)}
        </span>
      ))}
    </span>
  );
}

/** What's on disk for a film: quality, dubs, subtitles. */
export async function FileCard({
  info,
  title,
  user,
}: {
  info: MovieLibraryInfo | null;
  title: string;
  user: User;
}) {
  const file = info?.file;

  // Before there's a file, the hero says where the request is up to.
  if (!file || !info) return null;

  const canFix = info.subs ? await canFixSubs(user, info.subs) : false;
  return (
    <section className="card p-5">
      <div className="mb-4 flex min-w-0 items-baseline gap-3">
        <h3 className="shrink-0 font-semibold">In your library</h3>
        {info.playUrl && <DownloadButton item={videoDownload(info.playUrl, title, title, 0, file.size)} className="self-center" />}
        {file.name && (
          <span className="truncate text-xs text-muted" title={file.name}>
            {file.name}
          </span>
        )}
      </div>
      <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-[auto_auto_minmax(0,1fr)]">
        <Tile label="Video">
          <div>{[file.quality, file.hdr].filter(Boolean).join(" · ") || "—"}</div>
          <div className="text-xs text-muted">{[file.resolution, file.videoCodec, gb(file.size)].filter(Boolean).join(" · ")}</div>
        </Tile>
        <Tile label={file.audio.length > 1 ? "Audio · dubs" : "Audio"}>
          <Langs codes={file.audio} empty="Unknown" />
        </Tile>
        <Tile label="Subtitles">
          {info.subs ? <SubsBar subs={info.subs} canFix={canFix} title={title} chips /> : <Langs codes={file.embeddedSubs} empty="None found" />}
        </Tile>
      </dl>
    </section>
  );
}
