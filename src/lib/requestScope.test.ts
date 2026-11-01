import { describe, expect, it } from "vitest";
import { covers, inRanges, mergeRanges, requestRange, requestScope } from "./requestScope";

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
  it("keeps manga requests as separate chapter ranges, and spots repeats", () => {
    const r = (from: number, to: number | null) => ({ from, to });
    expect(requestRange({ startChapter: null, endChapter: 10 })).toEqual(r(0, 10));
    expect(mergeRanges([r(50, 60), r(1, 10)])).toEqual([r(1, 10), r(50, 60)]);
    expect(mergeRanges([r(1, 10), r(5, 20), r(20, 25)])).toEqual([r(1, 25)]);
    expect(mergeRanges([r(53, null), r(1, 10), r(60, 70)])).toEqual([r(1, 10), r(53, null)]);
    expect(inRanges(30, [r(1, 10), r(53, null)])).toBe(false);
    expect(inRanges(60, [r(1, 10), r(53, null)])).toBe(true);
    const have = [r(10, 20), r(50, null)];
    expect(covers([], r(0, null))).toBe(false);
    expect(covers(have, r(12, 18))).toBe(true); // inside
    expect(covers(have, r(10, 20))).toBe(true); // the same
    expect(covers(have, r(60, 70))).toBe(true); // already following everything after 50
    expect(covers(have, r(5, 15))).toBe(false); // reaches back
    expect(covers(have, r(15, 25))).toBe(false); // reaches on
    expect(covers(have, r(25, 30))).toBe(false); // in the gap
    expect(covers(have, r(15, null))).toBe(false);
    expect(covers([r(1, 10), r(5, 20)], r(8, 15))).toBe(true); // across two that overlap
  });
  it("leaves series requests as they were", () => {
    expect(requestScope({ target: "sonarr", seasons: [2], episodeRanges: null, absolute: false })).toBe("S2");
  });
});
