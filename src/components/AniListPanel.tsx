"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import type { AniListStatus } from "@/lib/clients/anilist";
import type { ListChange } from "@/lib/listEntry";
import { patchEntry, type EditableEntry } from "./ListEditor";
import { LIST_LABEL } from "./StatusBadge";
import { Modal } from "./Modal";
import { RatingForm } from "./RatingForm";
import { Select } from "./Select";
import { unreachable } from "@/lib/unreachable";

const STATUSES = Object.keys(LIST_LABEL) as AniListStatus[];

type Rating = { scores: Record<string, number>; total: number; ratedOn: string } | null;

/**
 * Your AniList entry for this anime (status, episodes, score) plus your rubric rating, in one compact panel that
 * sits beside the title.
 */
export function AniListPanel(props: {
  mediaId: number;
  title: string;
  episodes: number | null;
  /** Episodes aired so far, for shows still airing. */
  aired: number | null;
  /** Null when the viewer hasn't linked AniList. */
  entry: EditableEntry | null | undefined;
  linked: boolean;
  rating: Rating;
}) {
  const router = useRouter();
  const [entry, setEntry] = useState(props.entry ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [rating, setRating] = useState(false);
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
    const res = await fetch(`/api/anilist/entry?mediaId=${props.mediaId}`, { method: "DELETE" }).catch(unreachable);
    setBusy(false);
    if (!res.ok) return setErr((await res.json().catch(() => ({}))).error ?? "Failed");
    setEntry(null);
    setScoreDraft("");
    router.refresh();
  };

  const rateButton = (
    <button className="btn-ghost w-full justify-between px-3 py-1.5 text-sm" onClick={() => setRating(true)}>
      <span>{props.rating ? "Rate again" : "Rate it"}</span>
      <span className="text-xs text-muted">{props.rating ? `${props.rating.total}/100 · ${props.rating.ratedOn}` : "rubric"}</span>
    </button>
  );

  return (
    <div className={clsx("rounded-2xl border border-line bg-panel/80 p-4 backdrop-blur", busy && "opacity-70")}>
      <div className="mb-3 flex items-center gap-2">
        {/* Without AniList linked, all that's left here is your own rating. */}
        <h3 className="text-sm font-semibold">{props.linked ? "Your AniList" : "Your rating"}</h3>
        {props.linked && (
          <a className="ml-auto text-xs text-anilist hover:underline" href={`https://anilist.co/anime/${props.mediaId}`} target="_blank" rel="noreferrer">
            Open ↗
          </a>
        )}
      </div>

      {!props.linked ? null : !entry ? (
        <div className="mb-3 grid grid-cols-3 gap-1.5">
          {(["PLANNING", "CURRENT", "COMPLETED"] as const).map((s) => (
            <button
              key={s}
              className={clsx("rounded-lg px-2 py-1.5 text-xs", s === "PLANNING" ? "bg-anilist text-white hover:brightness-110" : "bg-panel-2 text-fg/80 hover:text-fg")}
              disabled={busy}
              onClick={() => apply({ kind: "status", value: s })}
            >
              {s === "PLANNING" ? "+ Planning" : s === "CURRENT" ? "Watching" : "Completed"}
            </button>
          ))}
        </div>
      ) : (
        <div className="mb-3 space-y-3">
          <div className="flex gap-2">
            <Select
              className="min-w-0 flex-1 py-1.5"
              aria-label="Status"
              value={entry.status}
              disabled={busy}
              onChange={(value) => apply({ kind: "status", value })}
              options={STATUSES.map((s) => ({ value: s, label: LIST_LABEL[s] }))}
            />
            <input
              className="input w-16 py-1.5 text-center text-sm"
              inputMode="numeric"
              aria-label="Score out of 100"
              title="Score (0–100) — Enter to save"
              placeholder="score"
              value={scoreDraft}
              disabled={busy}
              onChange={(e) => setScoreDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              onBlur={() => {
                const v = Number(scoreDraft);
                if (/^\d+$/.test(scoreDraft) && v <= 100 && v !== entry.score) apply({ kind: "score", value: v });
              }}
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <button
                className="h-8 w-8 rounded-lg bg-panel-2 text-lg leading-none hover:text-anilist disabled:opacity-40"
                aria-label="One episode less"
                disabled={busy || entry.progress <= 0}
                onClick={() => apply({ kind: "progress", value: entry.progress - 1 })}
              >
                −
              </button>
              <div className="flex-1 text-center text-sm tabular-nums">
                <span className="text-lg font-semibold">{entry.progress}</span>
                <span className="text-muted"> / {props.episodes ?? "?"} eps</span>
              </div>
              <button
                className="h-8 w-8 rounded-lg bg-anilist text-lg leading-none text-white hover:brightness-110 disabled:opacity-40"
                aria-label="Watched the next episode"
                disabled={busy || (!!max && entry.progress >= max)}
                onClick={() => apply({ kind: "progress", value: entry.progress + 1 })}
              >
                +
              </button>
            </div>
            {!!max && (
              <div className="h-1 overflow-hidden rounded-full bg-panel-2">
                <div className="h-full bg-anilist transition-[width]" style={{ width: `${Math.min(100, (entry.progress / max) * 100)}%` }} />
              </div>
            )}
            {props.aired !== null && !props.episodes && <p className="mt-1 text-xs text-muted">{props.aired} aired so far</p>}
          </div>
        </div>
      )}

      {rateButton}
      {entry && (
        <button className="mt-2 text-xs text-muted hover:text-bad" disabled={busy} onClick={remove}>
          Remove from list
        </button>
      )}
      {err && <p className="mt-2 text-sm text-bad">{err}</p>}

      {rating && (
        <Modal kicker="Rate it" title={props.title} onClose={() => setRating(false)} className="max-w-lg">
          <RatingForm anilistId={props.mediaId} canPush={props.linked} previous={props.rating} embedded onSaved={() => setTimeout(() => setRating(false), 900)} />
        </Modal>
      )}
    </div>
  );
}
