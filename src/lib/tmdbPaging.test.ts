import { describe, expect, it } from "vitest";
import { tmdbPaged } from "./tmdbPaging";

// A fake TMDB list of `total` titles with ids 1..total, 20 to a page.
const list = (total: number) => {
  const asked: number[] = [];
  const fetch = async (page: number) => {
    asked.push(page);
    const results = Array.from({ length: 20 }, (_, i) => ({ id: (page - 1) * 20 + i + 1 })).filter((r) => r.id <= total);
    return { page, total_pages: Math.ceil(total / 20), total_results: total, results };
  };
  return { fetch, asked };
};

describe("tmdbPaged", () => {
  it("stitches TMDB's 20-a-page lists into pages of 42", async () => {
    const l = list(1000);
    const p1 = await tmdbPaged(l.fetch, 1, 42);
    expect(p1.results.map((r) => r.id)).toEqual(Array.from({ length: 42 }, (_, i) => i + 1));
    expect(l.asked).toEqual([1, 2, 3, 4]);
    const p2 = await tmdbPaged(l.fetch, 2, 42);
    expect(p2.results[0].id).toBe(43);
    expect(p2.results.at(-1)!.id).toBe(84);
    expect(p2.hasNext).toBe(true);
  });

  it("stops at the end of the list without asking past it", async () => {
    const l = list(50);
    const p2 = await tmdbPaged(l.fetch, 2, 42);
    expect(p2.results.map((r) => r.id)).toEqual([43, 44, 45, 46, 47, 48, 49, 50]);
    expect(p2.hasNext).toBe(false);
    expect(Math.max(...l.asked)).toBe(3);
  });

  it("returns nothing for a page past TMDB's 500th instead of asking for it", async () => {
    const l = list(100_000);
    const res = await tmdbPaged(l.fetch, 300, 42);
    expect(res).toEqual({ results: [], hasNext: false });
    expect(l.asked).toEqual([]);
  });

  it("shows a title once when the list shifted between pages, and still fills the page", async () => {
    const fetch = async (page: number) => ({ page, total_pages: 5, total_results: 100, results: Array.from({ length: 20 }, (_, i) => ({ id: page === 2 && i === 0 ? 20 : (page - 1) * 20 + i + 1 })) });
    const ids = (await tmdbPaged(fetch, 1, 42)).results.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(42);
  });
});
