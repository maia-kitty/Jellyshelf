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
