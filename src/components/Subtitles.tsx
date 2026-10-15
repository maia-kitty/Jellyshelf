"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import type { BazarrCandidate } from "@/lib/clients/bazarr";
import type { SubsInfo } from "@/lib/episodes";
import type { FileSubs, SubsSummary } from "@/lib/subtitles";
import { summaryText } from "@/lib/subsText";
import { JarLoader } from "./AppIcon";

export type SubsTarget = { kind: "movie"; id: number } | { kind: "series"; id: number; episodeId: number };

async function postSubs<T>(body: unknown): Promise<T> {
  const res = await fetch("/api/subtitles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
  return j as T;
}

/** Bazarr works in the background; look again a few times so the result shows up without a reload. */
function useRefreshSoon() {
  const router = useRouter();
  return () => [3000, 8000, 15000, 30000].forEach((ms) => setTimeout(() => router.refresh(), ms));
}

/** Compact chip for the Requests page. */
export function SubsChip({ summary }: { summary: SubsSummary }) {
  const ok = !summary.missing.length;
  if (ok && !summary.have.length) return null;
  const m = summary.missing[0];
  return (
    <span
      className={clsx("rounded-md border px-1.5 py-0.5 text-[10px] font-medium", ok ? "border-ok/40 text-ok" : "border-warn/40 text-warn")}
      title={summaryText(summary, "episode") ?? undefined}
    >
      {ok ? `Subs ✓ ${summary.have.join(" ")}` : summary.files === 1 ? `No ${m.lang} subs` : `${m.lang} subs missing · ${m.files}`}
    </span>
  );
}

/** The languages one episode has (muted) and still lacks (amber). */
export function SubsChips({ subs }: { subs: FileSubs }) {
  return (
    <span className="flex shrink-0 gap-1">
      {subs.have.map((l) => (
        <span key={l} className="rounded bg-panel-2 px-1 text-[10px] text-muted" title={`${l} subtitles`}>
          {l}
        </span>
      ))}
      {subs.missing.map((l) => (
        <span key={l} className="rounded border border-warn/40 px-1 text-[10px] text-warn" title={`${l} subtitles missing`}>
          {l}
        </span>
      ))}
    </span>
  );
}

/** Summary line with "Search missing" (and, for a film, "Pick…"). */
export function SubsBar({ subs, canFix, title, className }: { subs: SubsInfo; canFix: boolean; title: string; className?: string }) {
  const refreshSoon = useRefreshSoon();
  const [state, setState] = useState<{ busy: boolean; msg: string; ok: boolean }>({ busy: false, msg: "", ok: true });
  const [picking, setPicking] = useState(false);
  const text = summaryText(subs.summary, subs.kind === "series" ? "episode" : "file");
  const missing = subs.summary.missing.length > 0;
  if (!text && !canFix) return null;

  const search = async () => {
    setState({ busy: true, msg: "", ok: true });
    try {
      await postSubs({ action: "search-missing", target: { kind: subs.kind, id: subs.id } });
      setState({ busy: false, msg: "Bazarr is searching…", ok: true });
      refreshSoon();
    } catch (e) {
      setState({ busy: false, msg: (e as Error).message, ok: false });
    }
  };

  return (
    <div className={clsx("flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm", className)}>
      <span className={missing ? "text-warn" : "text-muted"}>{text ?? "No subtitle info from Bazarr"}</span>
      {canFix && missing && (
        <button className="btn-ghost px-2.5 py-1 text-xs" disabled={state.busy} onClick={search}>
          {state.busy ? "Asking Bazarr…" : "Search missing"}
        </button>
      )}
      {canFix && subs.kind === "movie" && (
        <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => setPicking(true)}>
          Pick subtitles…
        </button>
      )}
      {state.msg && <span className={clsx("text-xs", state.ok ? "text-muted" : "text-bad")}>{state.msg}</span>}
      {picking && <SubtitlePicker target={{ kind: "movie", id: subs.id }} title={title} onClose={() => setPicking(false)} />}
    </div>
  );
}

const yes = (s: string) => s.toLowerCase() === "true";

/** Manual search: every candidate Bazarr's providers return, best first; download the one you want. */
export function SubtitlePicker({ target, title, onClose }: { target: SubsTarget; title: string; onClose: () => void }) {
  const refreshSoon = useRefreshSoon();
  const [list, setList] = useState<BazarrCandidate[] | null>(null);
  const [err, setErr] = useState("");
  const [lang, setLang] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    const body = { action: "candidates", target: target.kind === "series" ? { kind: "series", id: target.id, episodeId: target.episodeId } : target };
    postSubs<BazarrCandidate[]>(body).then(setList, (e) => setErr((e as Error).message));
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", esc);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const langs = useMemo(() => [...new Set(list?.map((c) => c.language) ?? [])].sort(), [list]);
  const shown = list?.filter((c) => !lang || c.language === lang) ?? [];

  const download = async (c: BazarrCandidate) => {
    const key = `${c.provider}:${c.subtitle}`;
    setBusy(key);
    setErr("");
    try {
      await postSubs({ action: "download", target, candidate: c });
      setDone(key);
      refreshSoon();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Pick subtitles" className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-t-2xl border border-line bg-panel shadow-2xl sm:rounded-2xl">
        <div className="flex items-center gap-3 border-b border-line px-5 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs uppercase tracking-wide text-muted">Pick subtitles</div>
            <div className="truncate font-semibold">{title}</div>
          </div>
          <button className="rounded-lg px-2 py-1 text-xl leading-none text-muted hover:bg-panel-2 hover:text-fg" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        {langs.length > 1 && (
          <div className="flex flex-wrap gap-1.5 border-b border-line px-5 py-2">
            {[null, ...langs].map((l) => (
              <button
                key={l ?? "all"}
                onClick={() => setLang(l)}
                className={clsx("rounded-md px-2 py-0.5 text-xs", lang === l ? "bg-accent text-white" : "bg-panel-2 text-muted hover:text-fg")}
              >
                {l ? l.toUpperCase() : "All"}
              </button>
            ))}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-[env(safe-area-inset-bottom)]">
          {err && <p className="px-3 py-3 text-sm text-bad">{err}</p>}
          {!list && !err && (
            <div className="py-10">
              <JarLoader width={180} label="Asking subtitle providers… this can take a little while" />
            </div>
          )}
          {list && !shown.length && <p className="py-10 text-center text-sm text-muted">No subtitles found. Bazarr only asks the providers enabled in its settings.</p>}
          <ul className="divide-y divide-line">
            {shown.map((c) => {
              const key = `${c.provider}:${c.subtitle}`;
              return (
                <li key={key} className="flex items-center gap-3 px-3 py-2.5">
                  <span
                    className={clsx(
                      "w-11 shrink-0 rounded-md py-1 text-center text-xs font-semibold tabular-nums",
                      c.score >= 90 ? "bg-ok/15 text-ok" : c.score >= 70 ? "bg-warn/15 text-warn" : "bg-panel-2 text-muted",
                    )}
                    title="Bazarr's match score"
                  >
                    {Math.round(c.score)}%
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm" title={c.release_info.join("\n")}>
                      {c.release_info[0] || "(no release name)"}
                      {c.release_info.length > 1 && <span className="text-muted"> +{c.release_info.length - 1}</span>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                      <span className="font-medium text-fg/80">{c.language.toUpperCase()}</span>
                      {yes(c.hearing_impaired) && <span className="rounded bg-panel-2 px-1">HI</span>}
                      {yes(c.forced) && <span className="rounded bg-panel-2 px-1">forced</span>}
                      <span>{c.provider}</span>
                      {c.uploader && <span>by {c.uploader}</span>}
                      {/* A file hash only ever matches on some providers, so it isn't worth flagging. */}
                      {c.dont_matches.some((m) => m !== "hash") && (
                        <span className="text-muted/70" title={`Doesn't match your file's: ${c.dont_matches.join(", ")}`}>
                          ≠ {c.dont_matches.filter((m) => m !== "hash").join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                  {done === key ? (
                    <span className="shrink-0 text-xs text-ok">✓ Saving</span>
                  ) : (
                    <button className="btn-ghost shrink-0 px-2.5 py-1 text-xs" disabled={busy !== null} onClick={() => download(c)}>
                      {busy === key ? "…" : "Download"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
