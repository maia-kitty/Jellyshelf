import { describe, expect, it } from "vitest";
import { chapterRuns } from "./chapterRuns";

describe("chapterRuns", () => {
  const ch = (number: number, onDisk: boolean) => ({ number, onDisk });
  it("lists downloaded chapters newest first and folds each run of missing ones into one row", () => {
    const rows = chapterRuns([ch(1, true), ch(2, false), ch(2.5, false), ch(3, false), ch(4, true), ch(5, false)]);
    expect(rows).toEqual([
      { kind: "missing", first: 5, last: 5, count: 1, requested: true },
      { kind: "chapter", chapter: ch(4, true) },
      { kind: "missing", first: 2, last: 3, count: 3, requested: true },
      { kind: "chapter", chapter: ch(1, true) },
    ]);
  });
  it("keeps chapters that were never asked for apart from the ones on their way", () => {
    const c = (number: number, onDisk: boolean, wanted = true) => ({ number, onDisk, wanted });
    const rows = chapterRuns([c(1, false, false), c(2, false, false), c(3, true), c(4, false), c(5, false)]);
    expect(rows.map((r) => (r.kind === "missing" ? `${r.first}-${r.last}:${r.requested}` : `ch${r.chapter.number}`))).toEqual([
      "4-5:true",
      "ch3",
      "1-2:false",
    ]);
  });
});
