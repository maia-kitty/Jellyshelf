import { describe, expect, it } from "vitest";
import { chapterSpan, mergeSpans, requestScope, widens } from "./requestScope";

describe("requestScope", () => {
  const manga = { target: "mangarr" as const, seasons: null, episodeRanges: null, absolute: false };
  it("describes manga requests by their start chapter", () => {
    expect(requestScope({ ...manga, startChapter: null })).toBe("Every chapter");
    expect(requestScope({ ...manga, startChapter: 0 })).toBe("Every chapter");
    expect(requestScope({ ...manga, startChapter: 139 })).toBe("From chapter 139");
    expect(requestScope({ ...manga, startChapter: null, endChapter: 10 })).toBe("Chapters 1–10");
    expect(requestScope({ ...manga, startChapter: 5, endChapter: 12.5 })).toBe("Chapters 5–12.5");
    expect(requestScope({ ...manga, startChapter: 7, endChapter: 7 })).toBe("Chapter 7");
  });
  it("merges manga requests into one chapter range, and spots repeats", () => {
    const r = (startChapter: number | null, endChapter: number | null) => ({ startChapter, endChapter });
    expect(chapterSpan([])).toBe(null);
    expect(chapterSpan([r(53, null), r(1, 10)])).toEqual({ start: 1, end: null });
    expect(chapterSpan([r(1, 10), r(null, 5)])).toEqual({ start: 0, end: 10 });
    expect(mergeSpans({ start: 10, end: 20 }, { start: 30, end: 40 })).toEqual({ start: 10, end: 40 });
    const span = { start: 10, end: 20 };
    expect(widens(null, { start: 0, end: null })).toBe(true);
    expect(widens(span, { start: 12, end: 18 })).toBe(false); // inside
    expect(widens(span, { start: 10, end: 20 })).toBe(false); // the same
    expect(widens(span, { start: 5, end: 15 })).toBe(true); // reaches back
    expect(widens(span, { start: 15, end: 25 })).toBe(true); // reaches on
    expect(widens(span, { start: 15, end: null })).toBe(true); // and keeps following
    expect(widens({ start: 10, end: null }, { start: 50, end: 60 })).toBe(false); // already following everything after 10
    expect(widens({ start: 10, end: null }, { start: 1, end: 5 })).toBe(true);
  });
  it("leaves series requests as they were", () => {
    expect(requestScope({ target: "sonarr", seasons: [2], episodeRanges: null, absolute: false })).toBe("S2");
  });
});
