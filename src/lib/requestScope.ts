import type { Request } from "@/db/schema";

/** What a request asked for, in a few words: "Movie", "S2", "S3 · ep 13–24", "Absolute ep 1089–…". */
export function requestScope(r: Pick<Request, "target" | "seasons" | "episodeRanges" | "absolute">) {
  if (r.target === "radarr") return "Movie";
  const eps = r.episodeRanges?.map((x) => `ep ${x.from}–${x.to ?? "…"}`).join(", ");
  if (r.absolute) return eps ? `Absolute ${eps}` : "Whole series";
  const s = r.seasons?.map((n) => (n === 0 ? "Specials" : `S${n}`)).join(", ");
  return [s, eps].filter(Boolean).join(" · ") || "Whole series";
}
