import { describe, expect, it } from "vitest";
import { sortRatings } from "./ratingSort";

const cats = [{ name: "Story" }, { name: "Sound" }];
const row = (title: string, score: number | null, rubric?: Record<string, number>, date = "2026-01-01") => ({
  title,
  date,
  anilistScore: score,
  rubric: rubric ? { id: 0, scores: rubric, total: Object.values(rubric).reduce((a, b) => a + b, 0), ratedOn: date, count: 1 } : null,
});
const rows = () => [
  row("A", 90, { Story: 15, Sound: 9 }),
  row("B", 95, { Story: 20, Sound: 5 }),
  row("C", 99),
  row("D", 80, { Story: 15, Sound: 10 }),
];
const titles = (r: { title: string }[]) => r.map((x) => x.title).join("");

describe("sortRatings", () => {
  it("sorts by a category, highest first, ties by overall score, no-rubric last", () => {
    expect(titles(sortRatings(rows(), { key: "Story", dir: 1 }, cats))).toBe("BADC");
  });
  it("reversed category sort still keeps no-rubric rows last", () => {
    expect(titles(sortRatings(rows(), { key: "Story", dir: -1 }, cats))).toBe("ADBC");
  });
  it("sorts by another category", () => {
    expect(titles(sortRatings(rows(), { key: "Sound", dir: 1 }, cats))).toBe("DABC");
  });
  it("overall score uses AniList score, falling back to the rubric total", () => {
    expect(titles(sortRatings(rows(), { key: "score", dir: 1 }, cats))).toBe("CBAD");
  });
});
