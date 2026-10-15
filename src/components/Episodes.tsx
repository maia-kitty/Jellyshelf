"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import type { EpisodesInfo } from "@/lib/episodes";
import { patchEntry } from "./ListEditor";
import { SubsBar, SubsChips, SubtitlePicker } from "./Subtitles";
import { langName } from "@/lib/langs";

const PAGE = 60;

function size(bytes: number | null) {
  if (!bytes) return null;
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`;
}

const code = (s: number, e: number) => `S${String(s).padStart(2, "0")}E${String(e).padStart(2, "0")}`;

/** "Audio: Japanese · English" or "Audio: Japanese · English on 10 of 12" when a dub only covers some episodes. */
function audioSummary(eps: EpisodesInfo["episodes"]) {
  const files = eps.filter((e) => e.hasFile && e.audio.length);
  if (!files.length) return null;
  const count = new Map<string, number>();
  for (const e of files) for (const l of e.audio) count.set(l, (count.get(l) ?? 0) + 1);
  const parts = [...count]
    .sort((a, b) => b[1] - a[1])
    .map(([l, n]) => (n === files.length ? langName(l) : `${langName(l)} on ${n} of ${files.length}`));
  return `Audio: ${parts.join(" · ")}`;
}

export function JellyfinButton({ href, label = "Play on Jellyfin" }: { href: string | null; label?: string }) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="btn bg-[#00a4dc] text-white hover:brightness-110">
      ▶ {label}
    </a>
  );
}

/**
 * Downloaded episodes with Jellyfin links. For anime, `anilist` enables watched ticks
 * (episode number ≤ list progress) and "watched up to here".
 */
export function EpisodeList({
  info,
  anilist,
  groupBySeason = false,
  title,
  canFixSubs = false,
}: {
  info: EpisodesInfo;
  anilist: { mediaId: number; progress: number } | null;
  groupBySeason?: boolean;
  /** Series title, for the subtitle picker. */
  title: string;
  /** May search Bazarr / pick subtitles (admins, or requesters when allowed). */
  canFixSubs?: boolean;
}) {
  const router = useRouter();
  const [showMissing, setShowMissing] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [progress, setProgress] = useState(anilist?.progress ?? 0);
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [picking, setPicking] = useState<{ id: number; label: string } | null>(null);

  const now = Date.now();
  const rows = info.episodes.filter((e) => e.hasFile || (showMissing && (!e.airDate || Date.parse(e.airDate) <= now + 7 * 864e5)));
  const shown = rows.slice(0, limit);
  const missing = info.episodes.length - info.downloaded;
  const audio = audioSummary(info.episodes);

  const markUpTo = async (n: number) => {
    if (!anilist) return;
    setBusy(n);
    setErr("");
    try {
      const next = await patchEntry(anilist.mediaId, { kind: "progress", value: n });
      setProgress(next.progress);
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="card mb-10 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h3 className="font-semibold">Episodes</h3>
        <span className="text-sm text-muted">
          {info.downloaded} of {info.total} downloaded
        </span>
        {missing > 0 && (
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" className="accent-accent" checked={showMissing} onChange={(e) => setShowMissing(e.target.checked)} />
            show missing
          </label>
        )}
        <span className="ml-auto">
          <JellyfinButton href={info.playUrl} label="Open in Jellyfin" />
        </span>
      </div>
      {(info.subs || audio) && (
        <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1.5">
          {audio && <span className="text-sm text-muted">{audio}</span>}
          {info.subs && <SubsBar subs={info.subs} canFix={canFixSubs} title={title} />}
        </div>
      )}
      {err && <p className="mb-2 text-sm text-bad">{err}</p>}
      {picking && info.subs && (
        <SubtitlePicker target={{ kind: "series", id: info.subs.id, episodeId: picking.id }} title={`${title} · ${picking.label}`} onClose={() => setPicking(null)} />
      )}

      {!rows.length ? (
        <p className="py-6 text-center text-sm text-muted">{info.episodes.length ? "Nothing downloaded yet." : "No episode information (not in Sonarr or Jellyfin)."}</p>
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((e, i) => {
            const watched = !!anilist && e.n <= progress;
            const newSeason = groupBySeason && (i === 0 || shown[i - 1].season !== e.season);
            return (
              <li key={`${e.season}x${e.episode}`}>
                {newSeason && <div className="pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted">Season {e.season}</div>}
                <div className={clsx("group flex items-center gap-3 py-2", !e.hasFile && "opacity-50")}>
                  <span className={clsx("w-10 shrink-0 text-right text-lg font-semibold tabular-nums", watched ? "text-anilist" : "text-muted")}>{e.n}</span>
                  <span className="w-4 shrink-0 text-anilist">{watched ? "✓" : ""}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm" title={e.title}>
                      {e.title || `Episode ${e.n}`}
                    </div>
                    <div className="text-xs text-muted tabular-nums">
                      {[
                        code(e.season, e.episode),
                        e.absolute !== null && e.absolute !== e.n ? `#${e.absolute}` : null,
                        e.hasFile ? e.quality : e.airDate ? `airs ${new Date(e.airDate).toLocaleDateString()}` : "missing",
                        size(e.size),
                        e.audio.length ? e.audio.join("+") : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  {e.subs &&
                    (canFixSubs && info.subs && e.id !== null ? (
                      <button
                        className="shrink-0 rounded-md p-0.5 text-xs text-muted ring-line hover:text-fg hover:ring-1"
                        onClick={() => setPicking({ id: e.id!, label: code(e.season, e.episode) })}
                        title="Pick subtitles for this episode"
                      >
                        {e.subs.have.length || e.subs.missing.length ? <SubsChips subs={e.subs} /> : "Subs…"}
                      </button>
                    ) : (
                      <SubsChips subs={e.subs} />
                    ))}
                  {/* Kept (invisible) on watched rows too, so the chips and Play line up down the list. */}
                  {anilist && (
                    <button
                      className={clsx(
                        // Phones have no hover to reveal it, and the row needs the room.
                        "shrink-0 text-xs text-muted opacity-0 hover:text-anilist group-hover:opacity-100 focus:opacity-100 max-sm:hidden",
                        watched && "invisible",
                      )}
                      tabIndex={watched ? -1 : undefined}
                      aria-hidden={watched || undefined}
                      disabled={busy !== null || watched}
                      onClick={() => markUpTo(e.n)}
                      title={`Set AniList progress to ${e.n}`}
                    >
                      {busy === e.n ? "…" : "watched up to here"}
                    </button>
                  )}
                  {e.playUrl ? (
                    <a href={e.playUrl} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-xs hover:border-[#00a4dc] hover:text-[#00a4dc]">
                      ▶ Play
                    </a>
                  ) : (
                    e.hasFile && <span className="shrink-0 text-xs text-muted" title="Downloaded, but Jellyfin hasn't picked it up yet">not in Jellyfin</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {rows.length > limit && (
        <button className="btn-ghost mt-3 w-full" onClick={() => setLimit(limit + PAGE * 5)}>
          Show more ({rows.length - limit} left)
        </button>
      )}
    </section>
  );
}
