import { describe, expect, it } from "vitest";
import { chapterSegments } from "./chapters";

describe("chapterSegments", () => {
  it("cold open, intro, credits and preview (Erai-raws)", () => {
    const ch = [
      { name: "Episode", start: 0 },
      { name: "Intro", start: 86 },
      { name: "Episode", start: 176 },
      { name: "Credits", start: 1325 },
      { name: "Preview", start: 1415 },
    ];
    expect(chapterSegments(ch, 1476.33)).toEqual([
      { type: "Intro", start: 86, end: 176 },
      { type: "Outro", start: 1325, end: 1415 },
      { type: "Preview", start: 1415, end: 1476.33 },
    ]);
  });
  it("an ending with an epilogue after it isn't the end", () => {
    const ch = [
      { name: "Opening", start: 0 },
      { name: "Episode", start: 89.99 },
      { name: "Ending", start: 1324.99 },
      { name: "Epilogue", start: 1414.94 },
    ];
    expect(chapterSegments(ch, 1420.05)).toEqual([{ type: "Intro", start: 0, end: 89.99 }]);
  });
  it("short group names, and no false matches", () => {
    const ch = [
      { name: "OP", start: 0 },
      { name: "Part A", start: 90 },
      { name: "Editing", start: 600 },
      { name: "ED", start: 1300 },
    ];
    expect(chapterSegments(ch, 1400).map((s) => s.type)).toEqual(["Intro", "Outro"]);
  });
});
