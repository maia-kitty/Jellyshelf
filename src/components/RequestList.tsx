"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import clsx from "clsx";
import type { MediaStatus, RequestStatus } from "@/db/schema";
import type { DownloadProgress } from "@/lib/downloads";
import { StatusBadge } from "./StatusBadge";
import { SubsChip } from "./Subtitles";
import { DownloadBar } from "./DownloadBar";
import { requestScope } from "@/lib/requestScope";
import type { SubsSummary } from "@/lib/subtitles";
import { sized } from "@/lib/img";
import { unreachable } from "@/lib/unreachable";

export interface RequestRow {
  id: number;
  status: RequestStatus;
  error: string | null;
  createdAt: string;
  target: "sonarr" | "radarr";
  seasons: number[] | null;
  episodeRanges: { from: number; to: number | null }[] | null;
  absolute: boolean;
  download: DownloadProgress | null;
  /** From Bazarr, once there are files. */
  subs: SubsSummary | null;
  media: { kind: string; title: string; poster: string | null; status: MediaStatus; href: string };
  user: { id: number; displayName: string };
}

const STATUS_CLS: Record<RequestStatus, string> = {
  pending: "text-warn",
  approved: "text-accent",
  declined: "text-muted",
  failed: "text-bad",
  completed: "text-ok",
};

const STATUS_BAR: Record<RequestStatus, string> = {
  pending: "before:bg-warn",
  approved: "before:bg-accent",
  declined: "before:bg-line",
  failed: "before:bg-bad",
  completed: "before:bg-ok",
};

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
/** "3 hours ago", "yesterday", … */
function ago(iso: string) {
  const s = (new Date(iso).getTime() - Date.now()) / 1000;
  for (const [unit, size] of [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]] as const) {
    if (Math.abs(s) >= size) return rtf.format(Math.round(s / size), unit);
  }
  return "just now";
}

const scope = requestScope;
/** Approved, but the availability sync found nothing coming for it (its reason is the error). */
const stuck = (r: RequestRow) => r.status === "approved" && !!r.error;

export function RequestList({ rows, isAdmin, userId }: { rows: RequestRow[]; isAdmin: boolean; userId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Keep download bars moving while anything is in a queue.
  const active = rows.some((r) => r.download && r.download.state !== "stuck");
  useEffect(() => {
    if (!active) return;
    // Not while the tab is in the background (each refresh asks Sonarr/Radarr); catch up as soon as it's back.
    const tick = () => !document.hidden && router.refresh();
    const t = setInterval(tick, 10_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [active, router]);

  const act = async (id: number, action: "approve" | "decline" | "retry" | "delete") => {
    setBusy(id);
    setErr(null);
    const res = await fetch(`/api/requests/${id}`, {
      method: action === "delete" ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: action === "delete" ? undefined : JSON.stringify({ action }),
    }).catch(unreachable);
    if (!res.ok) setErr((await res.json().catch(() => ({}))).error ?? "Failed");
    setBusy(null);
    router.refresh();
  };

  if (!rows.length) return <p className="py-16 text-center text-muted">Nothing here.</p>;
  return (
    <>
      {err && <p className="mb-3 text-sm text-bad">{err}</p>}
      <ul className="bounce-y grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {rows.map((r) => (
          <li
            key={r.id}
            className={clsx("card relative flex gap-4 overflow-hidden p-3 pl-4", "before:absolute before:inset-y-0 before:left-0 before:w-1", stuck(r) ? "before:bg-warn" : STATUS_BAR[r.status])}
          >
            <a href={r.media.href} className="h-28 w-[4.7rem] shrink-0 overflow-hidden rounded-lg bg-panel-2">
              {r.media.poster && (
                // eslint-disable-next-line @next/next/no-img-element
                <img {...sized(r.media.poster, 80)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
              )}
            </a>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-start justify-between gap-2">
                <a href={r.media.href} className="line-clamp-2 font-medium leading-snug hover:underline">
                  {r.media.title}
                </a>
                <span className={clsx("shrink-0 text-xs font-semibold uppercase tracking-wide", stuck(r) ? "text-warn" : STATUS_CLS[r.status])}>
                  {stuck(r) ? "stuck" : r.status === "approved" ? "processing" : r.status}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                <span className="rounded bg-panel-2 px-1.5 py-0.5 text-[10px] uppercase">{r.media.kind}</span>
                <span>
                  {scope(r)} → {r.target === "sonarr" ? "Sonarr" : "Radarr"}
                </span>
                {/* The request's own status already says pending/processing; only show the library state when it adds something. */}
                {(r.media.status === "available" || r.media.status === "partially_available") && <StatusBadge status={r.media.status} />}
                {r.subs && <SubsChip summary={r.subs} />}
              </div>
              <div className="mt-0.5 text-xs text-muted">
                {r.user.displayName} ·{" "}
                <time dateTime={r.createdAt} title={new Date(r.createdAt).toLocaleString()} suppressHydrationWarning>
                  {ago(r.createdAt)}
                </time>
              </div>
              {r.error && <div className={clsx("mt-1 line-clamp-2 text-xs", stuck(r) ? "text-warn" : "text-bad")}>{r.error}</div>}
              {r.download && <DownloadBar d={r.download} className="mt-2" />}
              <div className="mt-auto flex flex-wrap justify-end gap-2 pt-2">
                {isAdmin && r.status === "pending" && (
                  <>
                    <button className="btn-primary px-3 py-1" disabled={busy === r.id} onClick={() => act(r.id, "approve")}>
                      Approve
                    </button>
                    <button className="btn-ghost px-3 py-1" disabled={busy === r.id} onClick={() => act(r.id, "decline")}>
                      Decline
                    </button>
                  </>
                )}
                {isAdmin && (r.status === "failed" || stuck(r)) && (
                  <button className="btn-primary px-3 py-1" disabled={busy === r.id} onClick={() => act(r.id, "retry")}>
                    {stuck(r) ? "Search again" : "Retry"}
                  </button>
                )}
                {(isAdmin || (r.user.id === userId && r.status === "pending")) && (
                  <button className="btn-danger px-3 py-1" disabled={busy === r.id} onClick={() => act(r.id, "delete")}>
                    {isAdmin ? "Delete" : "Cancel"}
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
