import { afterEach, describe, expect, it, vi } from "vitest";
import { anilistQuery } from "./anilist";

afterEach(() => vi.unstubAllGlobals());

function fakeAniList(opts: { delayMs: number; remaining?: () => number }) {
  let active = 0;
  let maxActive = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, opts.delayMs));
      active--;
      return new Response(JSON.stringify({ data: { ok: true } }), {
        headers: { "x-ratelimit-limit": "90", "x-ratelimit-remaining": String(opts.remaining?.() ?? 80) },
      });
    }),
  );
  return { maxActive: () => maxActive };
}

describe("AniList rate limiting", () => {
  it("sends a burst right away, at most 4 at a time", async () => {
    const fake = fakeAniList({ delayMs: 40 });
    const t = Date.now();
    await Promise.all(Array.from({ length: 8 }, () => anilistQuery("{ ok }")));
    const took = Date.now() - t;
    expect(fake.maxActive()).toBe(4);
    // two waves of 40ms, not 8 × 700ms like the old fixed spacing
    expect(took).toBeLessThan(400);
  });

  it("pauses when AniList says the budget is nearly used up", async () => {
    let calls = 0;
    fakeAniList({ delayMs: 1, remaining: () => (++calls === 1 ? 1 : 80) });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await anilistQuery("{ ok }");
      const second = anilistQuery("{ ok }");
      let done = false;
      void second.then(() => (done = true));
      await vi.advanceTimersByTimeAsync(5_000);
      expect(done).toBe(false); // still paused
      await vi.advanceTimersByTimeAsync(30_000);
      await second;
      expect(done).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("franchise map layout", () => {
  const card = (id: number, year: number, format = "TV") => ({ id, format, type: "ANIME", startDate: { year, month: 1, day: 1 } }) as never;
  const media = (id: number, year: number, edges: [string, number, number, string?][]) =>
    ({ ...(card(id, year) as object), relations: { edges: edges.map(([relationType, to, y, f]) => ({ relationType, node: card(to, y, f) })) } }) as never;

  it("puts the story in airing order with each offshoot once, under the first entry leading to it", async () => {
    const { mapLayout } = await import("./anilist");
    const s2 = media(2, 2021, [["PREQUEL", 1, 2019], ["SIDE_STORY", 10, 2022, "MOVIE"], ["SUMMARY", 11, 2020, "SPECIAL"]]);
    const s1 = media(1, 2019, [["SEQUEL", 2, 2021], ["SIDE_STORY", 10, 2022, "MOVIE"], ["ADAPTATION", 99, 2010], ["OTHER", 98, 2020]]);
    const map = mapLayout([s2, s1]);
    expect(map.map((m) => [m.entry.id, m.branches.map((b) => b.entry.id)])).toEqual([[1, [10]], [2, [11]]]);
  });
});
