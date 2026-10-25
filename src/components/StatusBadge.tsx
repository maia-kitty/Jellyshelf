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

/** Each list status in the colour AniList itself gives it (teal for rewatching): solid for badges on artwork, tinted for chips. */
export const LIST_COLOR: Record<AniListStatus, { solid: string; tint: string }> = {
  CURRENT: { solid: "bg-[#68d639] text-black", tint: "bg-[#68d639]/15 text-[#68d639]" },
  REPEATING: { solid: "bg-[#2dd4bf] text-black", tint: "bg-[#2dd4bf]/15 text-[#2dd4bf]" },
  PLANNING: { solid: "bg-[#02a9ff] text-white", tint: "bg-[#02a9ff]/15 text-[#02a9ff]" },
  COMPLETED: { solid: "bg-[#9256f3] text-white", tint: "bg-[#9256f3]/15 text-[#a77bf6]" },
  PAUSED: { solid: "bg-[#f779a4] text-black", tint: "bg-[#f779a4]/15 text-[#f779a4]" },
  DROPPED: { solid: "bg-[#e85d75] text-white", tint: "bg-[#e85d75]/15 text-[#e85d75]" },
};

export function ListBadge({ status, progress, total, className }: { status: AniListStatus; progress?: number; total?: number | null; className?: string }) {
  const showProgress = (status === "CURRENT" || status === "PAUSED" || status === "REPEATING") && progress !== undefined;
  return (
    <span className={clsx("rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", LIST_COLOR[status].solid, className)}>
      {LIST_LABEL[status]}
      {showProgress && ` ${progress}${total ? `/${total}` : ""}`}
    </span>
  );
}
