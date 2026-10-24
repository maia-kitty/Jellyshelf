import type { Segment } from "./playbackTypes";

/** Chapter names release groups use for the skippable parts. Story chapters ("Episode", "Part A", "Epilogue") match none. */
const KINDS: [Segment["type"], RegExp][] = [
  ["Intro", /^(op\d*|opening( song| theme| credits)?|intro)\b/i],
  ["Outro", /^(ed\d*|ending( song| theme| credits)?|end credits|credits|outro)\b/i],
  ["Recap", /^(recap|previously)\b/i],
  ["Preview", /^(preview|next episode|next time)\b/i],
];

/**
 * Skippable segments from the file's named chapters, for when Jellyfin has no segments of its own (no intro-detection
 * plugin). Each chapter runs to the next one's start, the last to the end. An ending with story after it (an epilogue)
 * isn't treated as the end, so Up next doesn't cut that off.
 */
export function chapterSegments(chapters: { name: string; start: number }[], runTime: number): Segment[] {
  const typed = chapters.map((c, i) => ({
    type: KINDS.find(([, re]) => re.test(c.name.trim()))?.[0],
    start: c.start,
    end: chapters[i + 1]?.start ?? runTime,
  }));
  return typed
    .filter((c, i) => c.type && c.end > c.start && (c.type !== "Outro" || typed.slice(i + 1).every((l) => l.type === "Preview" || l.type === "Outro")))
    .map((c) => ({ type: c.type!, start: c.start, end: c.end }));
}
