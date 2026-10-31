import { describe, expect, it } from "vitest";
import { chapterRuns } from "./chapterRuns";

describe("chapterRuns", () => {
  const ch = (number: number, onDisk: boolean) => ({ number, onDisk });
  it("lists downloaded chapters newest first and folds each run of missing ones into one row", () => {
    const rows = chapterRuns([ch(1, true), ch(2, false), ch(2.5, false), ch(3, false), ch(4, true), ch(5, false)]);
    expect(rows).toEqual([
      { kind: "missing", first: 5, last: 5, count: 1 },
      { kind: "chapter", chapter: ch(4, true) },
      { kind: "missing", first: 2, last: 3, count: 3 },
      { kind: "chapter", chapter: ch(1, true) },
    ]);
  });
});
