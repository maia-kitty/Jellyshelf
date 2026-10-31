import type { Request } from "@/db/schema";

/** What a request asked for, in a few words: "Movie", "S2", "S3 · ep 13–24", "Absolute ep 1089–…", "S1 · Dub". */
export function requestScope(r: Pick<Request, "target" | "seasons" | "episodeRanges" | "absolute"> & { dub?: boolean; startChapter?: number | null }) {
  if (r.target === "mangarr") return r.startChapter ? `From chapter ${r.startChapter}` : "Every chapter";
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
