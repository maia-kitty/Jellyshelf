import { describe, expect, it } from "vitest";
import { anchorFor, CATEGORIES, parseRatingsCsv, toCsv } from "./rating";

describe("rating rubric", () => {
  it("adds up to 100", () => {
    expect(CATEGORIES.reduce((s, c) => s + c.max, 0)).toBe(100);
  });
  it("anchors pick the closest lower description", () => {
    expect(anchorFor(CATEGORIES[0], 17)).toBe("Solid, no major issues");
    expect(anchorFor(CATEGORIES[3], 9)).toBe("Great visuals");
  });
});

describe("ratings CSV", () => {
  it("imports the old layout without anilist_id", () => {
    const csv = "date,title,Story,Characters,Enjoyment,Animation/Art,Sound,Ending/Impact,Originality,total\n2026-07-30,Frieren S1,20,20,19,10,9,9,9,96\n";
    const { rows, errors } = parseRatingsCsv(csv);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ title: "Frieren S1", anilistId: null, total: 96 });
  });
  it("handles newer rows appended under an old header", () => {
    const csv =
      "date,title,Story,Characters,Enjoyment,Animation/Art,Sound,Ending/Impact,Originality,total\n" +
      "2026-07-30,demon slayer,17,15,19,9,8,6,7,81\n" +
      "2026-07-30,Horimiya,124080,16,18,20,8,6,8,7,83\n" +
      "2026-07-31,No match,,10,10,10,5,5,5,5,50\n";
    const { rows, errors } = parseRatingsCsv(csv);
    expect(errors).toEqual([]);
    expect(rows.map((r) => [r.title, r.anilistId, r.total])).toEqual([
      ["demon slayer", null, 81],
      ["Horimiya", 124080, 83],
      ["No match", null, 50],
    ]);
  });
  it("round-trips titles with commas and quotes", () => {
    const row = { ratedOn: "2026-08-20", title: 'Evangelion: 3.0+1.0, "Thrice"', anilistId: 99999, scores: Object.fromEntries(CATEGORIES.map((c) => [c.name, c.max])), total: 100 };
    const { rows } = parseRatingsCsv(toCsv([row]));
    expect(rows[0]).toEqual(row);
  });
  it("reports bad rows instead of failing the whole import", () => {
    const csv = "date,title,Story,Characters,Enjoyment,Animation/Art,Sound,Ending/Impact,Originality,total\nx,A,99,0,0,0,0,0,0,0\nx,B,1,1,1,1,1,1,1,7\n";
    const { rows, errors } = parseRatingsCsv(csv);
    expect(rows.map((r) => r.title)).toEqual(["B"]);
    expect(errors[0]).toMatch(/Line 2: Story/);
  });
});
