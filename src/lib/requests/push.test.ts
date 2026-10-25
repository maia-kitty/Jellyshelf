import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import type { SonarrEpisode } from "@/lib/clients/sonarr";

process.env.CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "jellyshelf-push-"));
const { episodesToSearch } = await import("./push");

const NOW = Date.parse("2026-10-25T00:00:00Z");
let id = 0;
const ep = (seasonNumber: number, episodeNumber: number, o: Partial<SonarrEpisode> = {}) =>
  ({ id: ++id, seasonNumber, episodeNumber, monitored: true, hasFile: false, airDateUtc: "2026-01-01T00:00:00Z", ...o }) as SonarrEpisode;

it("searches a season's missing, aired, monitored episodes in order", () => {
  const all = [ep(2, 2), ep(1, 1), ep(2, 1), ep(2, 3, { hasFile: true }), ep(2, 4, { airDateUtc: "2026-11-01T00:00:00Z" }), ep(2, 5, { monitored: false }), ep(2, 6, { airDateUtc: undefined })];
  const pick = (ids: number[]) => ids.map((i) => all.find((e) => e.id === i)!).map((e) => `${e.seasonNumber}x${e.episodeNumber}`);
  expect(pick(episodesToSearch(all, { absolute: false, seasons: [2] }, NOW))).toEqual(["2x1", "2x2"]);
  // A whole series: every season but specials.
  expect(pick(episodesToSearch([...all, ep(0, 1)], { absolute: true, seasons: null }, NOW))).toEqual(["1x1", "2x1", "2x2"]);
});
