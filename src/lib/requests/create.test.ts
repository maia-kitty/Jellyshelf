import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

process.env.CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "jellyshelf-create-"));
const { createRequestInput, shift } = await import("./create");

it("takes an episode range for one season or entry only", () => {
  expect(createRequestInput.safeParse({ kind: "tv", tmdbId: 1, seasons: [2], episodes: { from: 3, to: 5 } }).success).toBe(true);
  expect(createRequestInput.safeParse({ kind: "tv", tmdbId: 1, seasons: [1, 2], episodes: { from: 3, to: 5 } }).success).toBe(false);
  expect(createRequestInput.safeParse({ kind: "tv", tmdbId: 1, seasons: [2], episodes: { from: 5, to: 3 } }).success).toBe(false);
  expect(createRequestInput.safeParse({ kind: "anime", anilistIds: [1, 2], episodes: { from: 1, to: 1 } }).success).toBe(false);
});

it("maps an entry's own episode numbers to Sonarr's", () => {
  expect(shift({ from: 3, to: 5 }, null)).toEqual({ from: 3, to: 5 });
  // Part 2 of a split cour: its episode 1 is the season's 13.
  expect(shift({ from: 1, to: 2 }, { from: 13, to: 24 })).toEqual({ from: 13, to: 14 });
  // Absolute numbering, still airing.
  expect(shift({ from: 4, to: 4 }, { from: 1090, to: null })).toEqual({ from: 1093, to: 1093 });
});
