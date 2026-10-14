import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildMappingRows, parseAnimeListsXml, type FribbEntry } from "./sources";
import { resolveAnimeTarget, type AniEntryInfo } from "./resolve";

// Real rows from Fribb/anime-lists + Anime-Lists/anime-lists for a handful of titles and their siblings.
const fx = path.join(import.meta.dirname, "__fixtures__");
const fribb = JSON.parse(fs.readFileSync(path.join(fx, "fribb-subset.json"), "utf8")) as FribbEntry[];
const xml = parseAnimeListsXml(fs.readFileSync(path.join(fx, "anime-list-subset.xml"), "utf8"));
const rows = buildMappingRows(fribb, xml);
const byId = new Map(rows.map((r) => [r.anilistId, r]));

function resolve(entry: AniEntryInfo) {
  const m = byId.get(entry.id);
  const siblings = m?.tvdbId ? rows.filter((r) => r.tvdbId === m.tvdbId) : [];
  return resolveAnimeTarget(entry, m, siblings);
}

describe("buildMappingRows", () => {
  it("prefers Anime-Lists for season + offset", () => {
    expect(byId.get(104578)).toMatchObject({ tvdbId: 267440, tvdbSeason: 3, episodeOffset: 12 });
  });
  it("marks absolute-numbered shows with season -1", () => {
    expect(byId.get(21)).toMatchObject({ tvdbId: 81797, tvdbSeason: -1 });
  });
  it("keeps TMDB movie ids", () => {
    expect(byId.get(21519)).toMatchObject({ tmdbMovieId: 372058, tvdbId: null });
  });
});

describe("resolveAnimeTarget", () => {
  it("Attack on Titan S3 Part 2 → TVDB season 3, episodes 13-22", () => {
    expect(resolve({ id: 104578, format: "TV", episodes: 10 })).toEqual({
      service: "sonarr",
      tvdbId: 267440,
      season: 3,
      absolute: false,
      episodes: { from: 13, to: 22 },
    });
  });

  it("Attack on Titan S3 Part 1 → season 3, episodes 1-12 because the season is shared", () => {
    expect(resolve({ id: 99147, format: "TV", episodes: 12 })).toMatchObject({ season: 3, episodes: { from: 1, to: 12 } });
  });

  it("Frieren → whole season 1", () => {
    expect(resolve({ id: 154587, format: "TV", episodes: 28 })).toEqual({
      service: "sonarr",
      tvdbId: 424536,
      season: 1,
      absolute: false,
      episodes: null,
    });
  });

  it("One Piece → whole series, absolute numbering", () => {
    expect(resolve({ id: 21, format: "TV", episodes: null })).toEqual({
      service: "sonarr",
      tvdbId: 81797,
      season: null,
      absolute: true,
      episodes: null,
    });
  });

  it("Your Name → Radarr", () => {
    expect(resolve({ id: 21519, format: "MOVIE", episodes: 1 })).toEqual({ service: "radarr", tmdbId: 372058 });
  });

  it("Spy x Family Part 2 → season 1 episodes 13-25", () => {
    expect(resolve({ id: 142838, format: "TV", episodes: 13 })).toEqual({
      service: "sonarr",
      tvdbId: 405920,
      season: 1,
      absolute: false,
      episodes: { from: 13, to: 25 },
    });
  });

  it("airing split cour gets an open-ended range", () => {
    expect(resolve({ id: 142838, format: "TV", episodes: null })).toMatchObject({ episodes: { from: 13, to: null } });
  });

  it("unknown entry is unmapped", () => {
    expect(resolve({ id: 999999999, format: "TV", episodes: 12 })).toMatchObject({ service: "unmapped" });
  });
});

describe("rangesFromSiblings", () => {
  it("splits a shared season at each sibling's offset", async () => {
    const { rangesFromSiblings } = await import("@/lib/jobs/availability");
    const season3 = rows.filter((r) => r.tvdbId === 267440 && r.tvdbSeason === 3);
    const ranges = rangesFromSiblings(season3);
    expect(ranges.get(99147)).toEqual({ from: 1, to: 12 });
    expect(ranges.get(104578)).toEqual({ from: 13, to: null });
  });
});
