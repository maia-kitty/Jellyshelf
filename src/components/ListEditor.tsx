"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import type { AniListStatus } from "@/lib/clients/anilist";
import type { ListChange } from "@/lib/listEntry";
import { LIST_LABEL } from "./StatusBadge";

export interface EditableEntry {
  status: AniListStatus;
  progress: number;
  score: number;
}

export async function patchEntry(mediaId: number, change: ListChange): Promise<EditableEntry> {
  const res = await fetch("/api/anilist/entry", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mediaId, change }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? "AniList update failed");
  return j;
}

const STATUSES = Object.keys(LIST_LABEL) as AniListStatus[];

/** Edit your own AniList entry for one anime: status, episode progress, score. */
export function ListEditor(props: {
  mediaId: number;
  episodes: number | null;
  /** Episodes aired so far, for shows still airing. */
  aired: number | null;
  entry: EditableEntry | null;
}) {
  const router = useRouter();
  const [entry, setEntry] = useState(props.entry);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [scoreDraft, setScoreDraft] = useState(String(props.entry?.score || ""));
  const max = props.episodes ?? props.aired;

  const apply = async (change: ListChange) => {
    setBusy(true);
    setErr("");
    try {
      const next = await patchEntry(props.mediaId, change);
      setEntry(next);
      setScoreDraft(String(next.score || ""));
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm("Remove this anime from your AniList list?")) return;
    setBusy(true);
    const res = await fetch(`/api/anilist/entry?mediaId=${props.mediaId}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) return setErr((await res.json().catch(() => ({}))).error ?? "Failed");
    setEntry(null);
    setScoreDraft("");
    router.refresh();
  };

  if (!entry) {
    return (
      <div className="card p-4">
        <h3 className="mb-3 font-semibold">Your AniList</h3>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={busy} onClick={() => apply({ kind: "status", value: "PLANNING" })}>
            Add to Planning
          </button>
          <button className="btn-ghost" disabled={busy} onClick={() => apply({ kind: "status", value: "CURRENT" })}>
            Start watching
          </button>
          <button className="btn-ghost" disabled={busy} onClick={() => apply({ kind: "status", value: "COMPLETED" })}>
            Completed
          </button>
        </div>
        {err && <p className="mt-2 text-sm text-bad">{err}</p>}
      </div>
    );
  }

  const done = !!max && entry.progress >= max;
  return (
    <div className={clsx("card p-4", busy && "opacity-70")}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">Your AniList</h3>
        <button className="text-xs text-muted hover:text-bad" disabled={busy} onClick={remove}>
          Remove
        </button>
      </div>

      <label className="label">Status</label>
      <select
        className="input mb-4"
        value={entry.status}
        disabled={busy}
        onChange={(e) => apply({ kind: "status", value: e.target.value as AniListStatus })}
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {LIST_LABEL[s]}
          </option>
        ))}
      </select>

      <label className="label">Episodes watched</label>
      <div className="mb-1 flex items-center gap-2">
        <button className="btn-ghost px-3" disabled={busy || entry.progress <= 0} onClick={() => apply({ kind: "progress", value: entry.progress - 1 })}>
          −
        </button>
        <input
          key={entry.progress}
          className="input w-20 text-center"
          inputMode="numeric"
          defaultValue={entry.progress}
          disabled={busy}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          onBlur={(e) => {
            const v = Number(e.target.value);
            if (Number.isInteger(v) && v !== entry.progress) apply({ kind: "progress", value: v });
          }}
        />
        <span className="text-sm text-muted">/ {props.episodes ?? "?"}</span>
        <button className="btn-primary ml-auto" disabled={busy || done} onClick={() => apply({ kind: "progress", value: entry.progress + 1 })}>
          {done ? "All watched" : `Watched ep ${entry.progress + 1}`}
        </button>
      </div>
      {!!max && (
        <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-panel-2">
          <div className="h-full bg-anilist" style={{ width: `${Math.min(100, (entry.progress / max) * 100)}%` }} />
        </div>
      )}
      {props.aired !== null && !props.episodes && <p className="mb-4 text-xs text-muted">{props.aired} episodes aired so far</p>}

      <label className="label">Score (0–100)</label>
      <div className="flex gap-2">
        <input className="input w-24" inputMode="numeric" value={scoreDraft} onChange={(e) => setScoreDraft(e.target.value)} placeholder="—" disabled={busy} />
        <button
          className="btn-ghost"
          disabled={busy || scoreDraft === String(entry.score || "") || !/^\d+$/.test(scoreDraft) || Number(scoreDraft) > 100}
          onClick={() => apply({ kind: "score", value: Number(scoreDraft) })}
        >
          Set score
        </button>
      </div>
      {err && <p className="mt-2 text-sm text-bad">{err}</p>}
    </div>
  );
}

/** Compact "+1 episode" control for list grids. */
export function ProgressBump({ mediaId, progress, episodes }: { mediaId: number; progress: number; episodes: number | null }) {
  const router = useRouter();
  const [p, setP] = useState(progress);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const done = !!episodes && p >= episodes;
  return (
    <button
      className={clsx("mt-1.5 w-full rounded-lg border px-2 py-1 text-xs transition", err ? "border-bad text-bad" : "border-line text-muted hover:border-anilist hover:text-fg")}
      disabled={busy || done}
      title={err ? "Update failed, click to retry" : undefined}
      onClick={async () => {
        setBusy(true);
        setErr(false);
        try {
          const next = await patchEntry(mediaId, { kind: "progress", value: p + 1 });
          setP(next.progress);
          if (next.status === "COMPLETED") router.refresh();
        } catch {
          setErr(true);
        } finally {
          setBusy(false);
        }
      }}
    >
      {done ? "Done" : busy ? "…" : `+1 · ${p}/${episodes ?? "?"}`}
    </button>
  );
}
