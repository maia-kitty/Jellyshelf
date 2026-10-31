import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ anilistToken: () => null }));
vi.mock("@/lib/today", () => ({ viewerToday: async () => ({ year: 2026, month: 10, day: 31 }) }));
const { chapterProgress, nextChapter } = await import("./mangaProgress");

describe("chapterProgress", () => {
  it("counts whole chapters, as AniList does", () => {
    expect(chapterProgress(12)).toBe(12);
    expect(chapterProgress(12.5)).toBe(12);
  });
  it("ignores extras numbered 0 or below", () => {
    expect(chapterProgress(0)).toBeNull();
    expect(chapterProgress(0.5)).toBeNull();
    expect(chapterProgress(-1)).toBeNull();
  });
});

describe("nextChapter", () => {
  const ch = (...ns: number[]) => ns.map((number) => ({ number, onDisk: true }));
  it("is the first downloaded chapter after the progress, decimals included", () => {
    expect(nextChapter(12, ch(11, 12, 12.5, 13))).toBe(12.5);
    expect(nextChapter(12, ch(13, 11, 14))).toBe(13);
  });
  it("skips chapters that aren't downloaded, and is null when nothing's left", () => {
    expect(nextChapter(12, [{ number: 13, onDisk: false }, { number: 14, onDisk: true }])).toBe(14);
    expect(nextChapter(20, ch(19, 20))).toBeNull();
  });
});
