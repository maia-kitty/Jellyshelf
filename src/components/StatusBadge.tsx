import clsx from "clsx";
import type { MediaStatus } from "@/db/schema";
import type { AniListStatus } from "@/lib/clients/anilist";

const MEDIA: Record<MediaStatus, { label: string; cls: string } | null> = {
  unknown: null,
  pending: { label: "Requested", cls: "bg-warn/90 text-black" },
  processing: { label: "Processing", cls: "bg-accent/90 text-white" },
  partially_available: { label: "Partial", cls: "bg-ok/70 text-black" },
  available: { label: "Available", cls: "bg-ok text-black" },
};

export function StatusBadge({ status, className }: { status?: MediaStatus; className?: string }) {
  const s = status && MEDIA[status];
  if (!s) return null;
  return <span className={clsx("rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", s.cls, className)}>{s.label}</span>;
}

export const LIST_LABEL: Record<AniListStatus, string> = {
  CURRENT: "Watching",
  PLANNING: "Planning",
  COMPLETED: "Completed",
  DROPPED: "Dropped",
  PAUSED: "Paused",
  REPEATING: "Rewatching",
};

export function ListBadge({ status, progress, total, className }: { status: AniListStatus; progress?: number; total?: number | null; className?: string }) {
  const showProgress = (status === "CURRENT" || status === "PAUSED" || status === "REPEATING") && progress !== undefined;
  return (
    <span className={clsx("rounded-md bg-anilist/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white", className)}>
      {LIST_LABEL[status]}
      {showProgress && ` ${progress}${total ? `/${total}` : ""}`}
    </span>
  );
}
