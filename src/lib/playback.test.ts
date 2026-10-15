import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

// A throwaway database: CONFIG_DIR is read when @/db is first imported.
process.env.CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "jellyshelf-test-"));
vi.mock("@/lib/clients/anilist", () => ({
  anilist: { byIds: async (ids: number[]) => ids.map((id) => ({ id, title: { english: `Entry ${id}` } })) },
  aniTitle: (t: { english: string }) => t.english,
}));
const { db, ensureMigrated, schema } = await import("@/db");
const { anilistTarget } = await import("./playback");

const series = { Id: "s", Name: "Show", Type: "Series", ProviderIds: { Tvdb: "100" } };
const ep = (season: number, n: number) => ({ Id: `e${season}x${n}`, Name: "", Type: "Episode", ParentIndexNumber: season, IndexNumber: n });

beforeAll(async () => {
  await ensureMigrated();
  await db.insert(schema.idMapping).values([
    { anilistId: 1, tvdbId: 100, tvdbSeason: 1, episodeOffset: 0, type: "TV" },
    { anilistId: 2, tvdbId: 100, tvdbSeason: 2, episodeOffset: 0, type: "TV" },
    { anilistId: 3, tvdbId: 100, tvdbSeason: 2, episodeOffset: 12, type: "TV" }, // part 2 of a split cour
    { anilistId: 9, tvdbId: 100, tvdbSeason: 3, episodeOffset: 0, type: "TV" },
    { anilistId: 50, tmdbMovieId: 777, type: "MOVIE" },
  ]);
  // An admin moved entry 9 to another show.
  await db.insert(schema.idMappingOverride).values({ anilistId: 9, tvdbId: 200, tvdbSeason: 1, episodeOffset: 0 });
});

describe("anilistTarget", () => {
  it("numbers episodes within their AniList entry", async () => {
    expect(await anilistTarget(ep(1, 5), series)).toMatchObject({ mediaId: 1, episode: 5 });
    expect(await anilistTarget(ep(2, 12), series)).toMatchObject({ mediaId: 2, episode: 12 });
    expect(await anilistTarget(ep(2, 13), series)).toMatchObject({ mediaId: 3, episode: 1, title: "Entry 3" });
  });
  it("follows admin overrides", async () => {
    expect(await anilistTarget(ep(3, 1), series)).toBeNull();
  });
  it("maps anime films by TMDB id, and ignores what it can't place", async () => {
    expect(await anilistTarget({ Id: "m", Name: "", Type: "Movie", ProviderIds: { Tmdb: "777" } }, null)).toMatchObject({ mediaId: 50, episode: 1 });
    expect(await anilistTarget(ep(1, 1), { ...series, ProviderIds: {} })).toBeNull();
  });
});
