import type { SubtitleTrack } from "./playbackTypes";

/**
 * Which subtitle track a video starts with: the language you last picked ("off" for none), matching whether you'd picked
 * the SDH/hearing-impaired one and preferring text over image tracks, never a forced (signs-only) one; else the
 * stream's own choice, else the file's default. A plain track gives way to a styled one of the same kind, which shows
 * the same lines, better drawn.
 */
export function pickSubtitle(
  subs: SubtitleTrack[],
  remembered: { lang: string | null; hi: boolean },
  streamIndex: number | null,
): SubtitleTrack | null {
  if (remembered.lang === "off") return null;
  const full = subs.filter((s) => !s.isForced);
  // In that language: SDH-or-not as you had it first, then one the browser draws itself (an image track means
  // re-encoding the whole video to burn it in); first in the file breaks ties.
  const score = (s: SubtitleTrack) => (s.hi === remembered.hi ? 2 : 0) + (s.kind !== "burn" ? 1 : 0);
  const byLang = remembered.lang
    ? full.filter((s) => s.language === remembered.lang).reduce<SubtitleTrack | undefined>((best, s) => (!best || score(s) > score(best) ? s : best), undefined)
    : undefined;
  const chosen = byLang ?? subs.find((s) => s.index === streamIndex) ?? subs.find((s) => s.isDefault) ?? null;
  if (!chosen || chosen.kind === "ass") return chosen;
  return full.find((s) => s.kind === "ass" && s.language === chosen.language && s.hi === chosen.hi) ?? chosen;
}
