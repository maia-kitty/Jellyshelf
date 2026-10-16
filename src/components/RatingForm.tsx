"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import { anchorFor, CATEGORIES, total } from "@/lib/rating";
import { scoreColor } from "@/lib/scoreColor";
import { unreachable } from "@/lib/unreachable";

/** Your personal rubric (Story / Characters / … / Originality = 100), saved locally and pushed to AniList. */
export function RatingForm(props: {
  anilistId: number;
  canPush: boolean;
  previous: { scores: Record<string, number>; total: number; ratedOn: string } | null;
  /** Inside a dialog: no card, no collapse. */
  embedded?: boolean;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [expanded, setOpen] = useState(false);
  const open = props.embedded || expanded;
  const [scores, setScores] = useState<Record<string, number>>(
    props.previous?.scores ?? Object.fromEntries(CATEGORIES.map((c) => [c.name, Math.round(c.max / 2)])),
  );
  const [push, setPush] = useState(props.canPush);
  const [markCompleted, setMarkCompleted] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const sum = total(scores);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/ratings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anilistId: props.anilistId, scores, push: push && props.canPush, markCompleted }),
    }).catch(unreachable);
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: j.error ?? "Save failed" });
    setMsg(
      j.pushError
        ? { ok: false, text: `Saved, but the AniList push failed: ${j.pushError}` }
        : { ok: true, text: push && props.canPush ? `Saved ${sum}/100 and pushed to AniList` : `Saved ${sum}/100` },
    );
    router.refresh();
    if (!j.pushError) props.onSaved?.();
  };

  return (
    <div className={props.embedded ? "p-5" : "card p-4"}>
      {!props.embedded && (
        <button className="mb-4 flex w-full items-center justify-between" onClick={() => setOpen(!open)}>
          <span className="font-semibold">Rate it</span>
          <span className="text-sm text-muted">
            {props.previous ? `Last: ${props.previous.total}/100 · ${props.previous.ratedOn}` : "Not rated"} {open ? "−" : "+"}
          </span>
        </button>
      )}
      {open && (
        <div className="space-y-5">
          {CATEGORIES.map((c) => {
            const v = scores[c.name];
            const ticks = Object.keys(c.anchors).map(Number);
            return (
              <div key={c.name}>
                <div className="mb-1 flex items-baseline justify-between text-sm">
                  <span className="font-medium">{c.name}</span>
                  <span className="tabular-nums">
                    <span className="text-lg font-semibold transition-colors" style={{ color: scoreColor(v, c.max) }}>
                      {v}
                    </span>
                    <span className="text-muted">/{c.max}</span>
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={c.max}
                  step={1}
                  value={v}
                  onChange={(e) => setScores({ ...scores, [c.name]: Number(e.target.value) })}
                  className="w-full accent-accent"
                  aria-label={c.name}
                />
                <div className="mt-1 flex flex-wrap gap-1">
                  {ticks.map((t) => (
                    <button
                      key={t}
                      title={c.anchors[t]}
                      onClick={() => setScores({ ...scores, [c.name]: t })}
                      className={clsx(
                        "rounded px-1.5 py-0.5 text-[11px] tabular-nums",
                        t === v ? "bg-accent text-white" : "bg-panel-2 text-muted hover:text-fg",
                      )}
                    >
                      {t}
                    </button>
                  ))}
                  <span className="ml-1 self-center text-xs text-muted">{anchorFor(c, v)}</span>
                </div>
              </div>
            );
          })}

          <div className="flex items-baseline justify-between border-t border-line pt-4">
            <span className="text-sm text-muted">Total</span>
            <span className="tabular-nums">
              <span className="text-3xl font-bold transition-colors" style={{ color: scoreColor(sum, 100) }}>
                {sum}
              </span>
              <span className="text-muted">/100</span>
              <span className="ml-2 text-sm text-muted">({(sum / 10).toFixed(1)})</span>
            </span>
          </div>

          <div className="space-y-2 text-sm">
            <label className={clsx("flex items-center gap-2", !props.canPush && "opacity-50")}>
              <input type="checkbox" className="accent-accent" disabled={!props.canPush} checked={push && props.canPush} onChange={(e) => setPush(e.target.checked)} />
              Push score to AniList {!props.canPush && "(link AniList first)"}
            </label>
            <label className={clsx("flex items-center gap-2", !(push && props.canPush) && "opacity-50")}>
              <input type="checkbox" className="accent-accent" disabled={!(push && props.canPush)} checked={markCompleted} onChange={(e) => setMarkCompleted(e.target.checked)} />
              Mark as completed
            </label>
          </div>

          <button className="btn-primary w-full" disabled={busy} onClick={save}>
            {busy ? "Saving…" : props.previous ? "Save new rating" : "Save rating"}
          </button>
          {msg && <p className={clsx("text-sm", msg.ok ? "text-ok" : "text-bad")}>{msg.text}</p>}
        </div>
      )}
    </div>
  );
}
