"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import type { MediaStatus, RequestStatus } from "@/db/schema";
import { StatusBadge } from "./StatusBadge";

export interface RequestRow {
  id: number;
  status: RequestStatus;
  error: string | null;
  createdAt: string;
  target: "sonarr" | "radarr";
  seasons: number[] | null;
  episodeRanges: { from: number; to: number | null }[] | null;
  absolute: boolean;
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

function scope(r: RequestRow) {
  if (r.target === "radarr") return "Movie";
  const eps = r.episodeRanges?.map((x) => `ep ${x.from}–${x.to ?? "…"}`).join(", ");
  if (r.absolute) return eps ? `Absolute ${eps}` : "Whole series";
  const s = r.seasons?.map((n) => (n === 0 ? "Specials" : `S${n}`)).join(", ");
  return [s, eps].filter(Boolean).join(" · ");
}

export function RequestList({ rows, isAdmin, userId }: { rows: RequestRow[]; isAdmin: boolean; userId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const act = async (id: number, action: "approve" | "decline" | "retry" | "delete") => {
    setBusy(id);
    setErr(null);
    const res = await fetch(`/api/requests/${id}`, {
      method: action === "delete" ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: action === "delete" ? undefined : JSON.stringify({ action }),
    });
    if (!res.ok) setErr((await res.json().catch(() => ({}))).error ?? "Failed");
    setBusy(null);
    router.refresh();
  };

  if (!rows.length) return <p className="py-16 text-center text-muted">No requests.</p>;
  return (
    <>
      {err && <p className="mb-3 text-sm text-bad">{err}</p>}
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="card flex flex-wrap items-center gap-4 p-3">
            <a href={r.media.href} className="h-20 w-14 shrink-0 overflow-hidden rounded-lg bg-panel-2">
              {r.media.poster && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.media.poster} alt="" className="h-full w-full object-cover" />
              )}
            </a>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <a href={r.media.href} className="font-medium hover:underline">
                  {r.media.title}
                </a>
                <span className="rounded bg-panel-2 px-1.5 py-0.5 text-[10px] uppercase text-muted">{r.media.kind}</span>
                <StatusBadge status={r.media.status} />
              </div>
              <div className="mt-0.5 text-xs text-muted">
                {scope(r)} → {r.target === "sonarr" ? "Sonarr" : "Radarr"} · by {r.user.displayName} ·{" "}
                {new Date(r.createdAt).toLocaleString()}
              </div>
              {r.error && <div className="mt-1 text-xs text-bad">{r.error}</div>}
            </div>
            <span className={clsx("text-sm font-medium capitalize", STATUS_CLS[r.status])}>{r.status === "approved" ? "processing" : r.status}</span>
            <div className="flex gap-2">
              {isAdmin && r.status === "pending" && (
                <>
                  <button className="btn-primary" disabled={busy === r.id} onClick={() => act(r.id, "approve")}>
                    Approve
                  </button>
                  <button className="btn-ghost" disabled={busy === r.id} onClick={() => act(r.id, "decline")}>
                    Decline
                  </button>
                </>
              )}
              {isAdmin && r.status === "failed" && (
                <button className="btn-primary" disabled={busy === r.id} onClick={() => act(r.id, "retry")}>
                  Retry
                </button>
              )}
              {(isAdmin || (r.user.id === userId && r.status === "pending")) && (
                <button className="btn-danger" disabled={busy === r.id} onClick={() => act(r.id, "delete")}>
                  {isAdmin ? "Delete" : "Cancel"}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
