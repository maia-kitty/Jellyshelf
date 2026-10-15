import type { SubsSummary } from "./subtitles";

/** "Subtitles ✓ EN" / "EN missing on 3 of 12 episodes" */
export function summaryText(s: SubsSummary, unit: "episode" | "movie" | "file" = "file") {
  if (!s.missing.length) return s.have.length ? `Subtitles ✓ ${s.have.join(" · ")}` : null;
  if (s.files === 1) return `No ${s.missing.map((m) => m.lang).join(" / ")} subtitles yet`;
  const m = s.missing[0];
  const more = s.missing.length > 1 ? ` (+${s.missing.length - 1} more)` : "";
  return `${m.lang} missing on ${m.files} of ${s.files} ${unit}s${more}`;
}
