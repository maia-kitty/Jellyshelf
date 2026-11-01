import type { Request } from "@/db/schema";

/** What a request asked for, in a few words: "Movie", "S2", "S3 · ep 13–24", "Absolute ep 1089–…", "S1 · Dub". */
export function requestScope(
  r: Pick<Request, "target" | "seasons" | "episodeRanges" | "absolute"> & { dub?: boolean; startChapter?: number | null; endChapter?: number | null },
) {
  if (r.target === "mangarr") {
    if (r.endChapter != null) return r.endChapter === (r.startChapter || 1) ? `Chapter ${r.endChapter}` : `Chapters ${r.startChapter || 1}–${r.endChapter}`;
    return r.startChapter ? `From chapter ${r.startChapter}` : "Every chapter";
  }
  return r.dub ? `${scope(r)} · Dub` : scope(r);
}

function scope(r: Pick<Request, "target" | "seasons" | "episodeRanges" | "absolute">) {
  if (r.target === "radarr") return "Movie";
  const eps = r.episodeRanges?.map((x) => `ep ${x.from}–${x.to ?? "…"}`).join(", ");
  if (r.absolute) return eps ? `Absolute ${eps}` : "Whole series";
  const s = r.seasons?.map((n) => (n === 0 ? "Specials" : `S${n}`)).join(", ");
  return [s, eps].filter(Boolean).join(" · ") || "Whole series";
}

/** A series request for all of it, rather than some seasons or an episode range ("Whole series" above). */
export const wholeSeries = (r: Pick<Request, "seasons" | "episodeRanges" | "absolute">) =>
  !r.episodeRanges?.length && (r.absolute || !r.seasons?.length);

/** Removing one of these also deletes the title from Sonarr/Radarr (pending and declined ones never got there). */
export const sentOn = (r: { status: string }) => r.status !== "pending" && r.status !== "declined";

/** The chapters a manga's requests cover together: one range (Mangarr wants one per series); end null = ongoing. */
export type ChapterSpan = { start: number; end: number | null };
export function chapterSpan(reqs: { startChapter: number | null; endChapter: number | null }[]): ChapterSpan | null {
  if (!reqs.length) return null;
  return {
    start: Math.min(...reqs.map((r) => r.startChapter ?? 0)),
    end: reqs.some((r) => r.endChapter === null) ? null : Math.max(...reqs.map((r) => r.endChapter!)),
  };
}
/** Both ranges as one, the way Mangarr will hold them. */
export const mergeSpans = (a: ChapterSpan, b: ChapterSpan): ChapterSpan => ({
  start: Math.min(a.start, b.start),
  end: a.end === null || b.end === null ? null : Math.max(a.end, b.end),
});
/** Does asking for `next` add chapters to what's already asked for? (Otherwise it's a repeat.) */
export function widens(span: ChapterSpan | null, next: ChapterSpan) {
  const m = span && mergeSpans(span, next);
  return !span || m!.start < span.start || m!.end !== span.end;
}
