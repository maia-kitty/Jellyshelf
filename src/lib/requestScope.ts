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

/** Chapters `from` to `to` (both included); `to` null = every chapter after `from`, new ones too. */
export type ChapterRange = { from: number; to: number | null };
/** A manga request's chapters. */
export const requestRange = (r: { startChapter: number | null; endChapter: number | null }): ChapterRange => ({ from: r.startChapter ?? 0, to: r.endChapter });
/** Sorted, with overlapping ranges joined (1–10 + 5–20 = 1–20); separate ones stay separate, like Mangarr keeps them. */
export function mergeRanges(ranges: ChapterRange[]): ChapterRange[] {
  const out: ChapterRange[] = [];
  for (const r of [...ranges].sort((a, b) => a.from - b.from)) {
    const last = out.at(-1);
    if (last && (last.to === null || r.from <= last.to)) last.to = last.to === null || r.to === null ? null : Math.max(last.to, r.to);
    else out.push({ ...r });
  }
  return out;
}
export const inRanges = (n: number, ranges: ChapterRange[]) => ranges.some((r) => n >= r.from && (r.to === null || n <= r.to));
/** Is every chapter of `r` already in `ranges`? (Then asking for it again adds nothing.) */
export const covers = (ranges: ChapterRange[], r: ChapterRange) =>
  mergeRanges(ranges).some((m) => m.from <= r.from && (m.to === null || (r.to !== null && r.to <= m.to)));
