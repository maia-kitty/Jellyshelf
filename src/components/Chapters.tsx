"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import type { MangarrChapter } from "@/lib/clients/mangarr";
import { patchEntry } from "./ListEditor";
import { DownloadButton } from "./DownloadButton";
import { download, mangaDownload, useInApp } from "@/lib/app";
import { inRanges, type ChapterRange } from "@/lib/requestScope";

const PAGE = 60;
const time = (ms: number | null) => (ms ? `downloaded ${new Date(ms).toLocaleDateString()}` : null);

/**
 * A manga's chapters, laid out like the anime episode list (EpisodeList): what's downloaded, with "show missing" for
 * the rest. The number opens the reader; ✓ marks what you've read on AniList ("read up to here" sets it). Chapters
 * that were never asked for can be requested from here on (normal approval; Mangarr then reaches back to them).
 */
export function ChapterList({
  mangaId,
  chapters,
  anilist,
  requested: pending,
  title,
  poster,
}: {
  mangaId: number;
  /** The series' title and cover, for the Android app's Downloads screen. */
  title: string;
  poster: string | null;
  /** Everything Mangarr knows, including chapters that weren't requested (`wanted: false`). */
  chapters: MangarrChapter[];
  /** Your AniList progress, when AniList is linked. */
  anilist: { progress: number } | null;
  /** The chapters requests still waiting for approval ask for. */
  requested: ChapterRange[];
}) {
  const router = useRouter();
  const [showMissing, setShowMissing] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [progress, setProgress] = useState(anilist?.progress ?? 0);
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState("");

  const sorted = [...chapters].sort((a, b) => a.number - b.number);
  const downloaded = sorted.filter((c) => c.onDisk).length;
  const rows = sorted.filter((c) => c.onDisk || showMissing);
  const shown = rows.slice(0, limit);
  const missing = sorted.length - downloaded;
  const app = useInApp();
  const keep = (c: MangarrChapter) => mangaDownload(mangaId, c.number, title, c.name, poster);
  // "Download unread": what's here past your AniList progress (all of it without AniList).
  const unread = sorted.filter((c) => c.onDisk && Math.floor(c.number) > progress);

  const act = async (n: number, fn: () => Promise<unknown>) => {
    setBusy(n);
    setErr("");
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  // AniList counts whole chapters: 12.5 read means 12.
  const readUpTo = (n: number) =>
    act(n, async () => setProgress((await patchEntry(mangaId, { kind: "progress", value: Math.floor(n) }, "manga")).progress));
  const requestFrom = (n: number) =>
    act(n, async () => {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "manga", anilistId: mangaId, startChapter: n }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Request failed (${res.status})`);
    });

  if (!chapters.length) return null;
  return (
    <section className="card rise-in mb-10 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h3 className="font-semibold">Chapters</h3>
        <span className="text-sm text-muted">
          {downloaded} of {sorted.length} downloaded
        </span>
        {missing > 0 && (
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" className="accent-accent" checked={showMissing} onChange={(e) => setShowMissing(e.target.checked)} />
            show missing
          </label>
        )}
        {app && unread.length > 0 && (
          <button className="ml-auto text-sm text-muted hover:text-fg" onClick={() => download(unread.map(keep))}>
            Download {anilist ? "unread" : "all"} ({unread.length})
          </button>
        )}
      </div>
      {err && <p className="mb-2 text-sm text-bad">{err}</p>}

      {!rows.length ? (
        <p className="py-6 text-center text-sm text-muted">Nothing downloaded yet.</p>
      ) : (
        <ul className="bounce-y divide-y divide-line">
          {shown.map((c) => {
            const read = !!anilist && c.number >= 1 && Math.floor(c.number) <= progress;
            const requested = !c.wanted && inRanges(c.number, pending);
            return (
              <li key={c.number}>
                <div className={clsx("group flex items-center gap-3 py-2", !c.onDisk && "opacity-50")}>
                  {c.onDisk ? (
                    // The number opens the reader: on hover it shrinks away and an arrow grows in its place, as on episodes.
                    <Link
                      prefetch={false}
                      href={`/read/${mangaId}/${c.number}`}
                      className={clsx("group/num relative w-14 shrink-0 text-right text-lg font-semibold tabular-nums", read ? "text-anilist" : "text-muted")}
                      aria-label={`Read chapter ${c.number}`}
                      title="Read"
                    >
                      <span className="inline-block transition duration-200 group-hover/num:scale-50 group-hover/num:opacity-0 group-focus-visible/num:scale-50 group-focus-visible/num:opacity-0">{c.number}</span>
                      <span className="absolute inset-0 flex items-center justify-end text-[#00a4dc] opacity-0 transition duration-200 scale-50 group-hover/num:scale-100 group-hover/num:opacity-100 group-focus-visible/num:scale-100 group-focus-visible/num:opacity-100">
                        <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
                          <path d="M8 5.5L8 18.5L19 12Z" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                        </svg>
                      </span>
                    </Link>
                  ) : (
                    <span className={clsx("w-14 shrink-0 text-right text-lg font-semibold tabular-nums", read ? "text-anilist" : "text-muted")}>{c.number}</span>
                  )}
                  <span className="w-4 shrink-0 text-anilist">{read ? "✓" : ""}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm" title={c.name ?? undefined}>
                      {c.name || `Chapter ${c.number}`}
                    </div>
                    <div className="text-xs text-muted tabular-nums">
                      {c.onDisk ? time(c.imported) ?? "downloaded" : c.wanted ? "on its way" : requested ? "requested" : "not requested"}
                      {anilist && !read && c.onDisk && c.number >= 1 && (
                        // Phones have no hover to reveal it.
                        <button
                          className="ml-2 text-muted opacity-0 hover:text-anilist group-hover:opacity-100 focus:opacity-100 max-sm:hidden"
                          disabled={busy !== null}
                          onClick={() => readUpTo(c.number)}
                          title={`Set AniList progress to ${Math.floor(c.number)}`}
                        >
                          {busy === c.number ? "…" : "read up to here"}
                        </button>
                      )}
                      {!c.wanted && !requested && (
                        <button
                          className="ml-2 text-muted opacity-0 hover:text-accent group-hover:opacity-100 focus:opacity-100 max-sm:opacity-100"
                          disabled={busy !== null}
                          onClick={() => requestFrom(c.number)}
                          title={`Request every chapter from ${c.number} on`}
                        >
                          {busy === c.number ? "…" : "request from here"}
                        </button>
                      )}
                    </div>
                  </div>
                  {c.onDisk && <DownloadButton item={keep(c)} />}
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
