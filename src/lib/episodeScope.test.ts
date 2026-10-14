import { describe, expect, it } from "vitest";
import { scopeEpisodes } from "./episodeScope";

// AoT-ish: S3 has 22 episodes, absolute numbers continue from S1-2 (37 eps).
const eps = [
  ...Array.from({ length: 25 }, (_, i) => ({ season: 1, episode: i + 1, absolute: i + 1 })),
  ...Array.from({ length: 22 }, (_, i) => ({ season: 3, episode: i + 1, absolute: 38 + i })),
  { season: 0, episode: 1, absolute: null },
];
const ns = (r: { n: number }[]) => r.map((e) => e.n);

describe("scopeEpisodes", () => {
  it("split cour: S3 eps 13-22 become 1-10", () => {
    const r = scopeEpisodes(eps, { service: "sonarr", tvdbId: 1, season: 3, absolute: false, episodes: { from: 13, to: 22 } });
    expect(r.map((e) => e.episode)).toEqual([13, 14, 15, 16, 17, 18, 19, 20, 21, 22]);
    expect(ns(r)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
  it("whole season keeps its numbering", () => {
    const r = scopeEpisodes(eps, { service: "sonarr", tvdbId: 1, season: 1, absolute: false, episodes: null });
    expect(r).toHaveLength(25);
    expect(r[0].n).toBe(1);
  });
  it("absolute whole series numbers by absolute episode and skips specials", () => {
    const r = scopeEpisodes(eps, { service: "sonarr", tvdbId: 1, season: null, absolute: true, episodes: null });
    expect(r).toHaveLength(47);
    expect(r.at(-1)!.n).toBe(59);
  });
  it("absolute range with open end", () => {
    const r = scopeEpisodes(eps, { service: "sonarr", tvdbId: 1, season: null, absolute: true, episodes: { from: 50, to: null } });
    expect(r.map((e) => [e.season, e.episode, e.n])).toEqual([
      [3, 13, 1],
      ...Array.from({ length: 9 }, (_, i) => [3, 14 + i, 2 + i]),
    ]);
  });
  it("plain TV: all regular seasons", () => {
    expect(scopeEpisodes(eps, null)).toHaveLength(47);
  });
});
