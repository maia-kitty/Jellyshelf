import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import type { SonarrEpisode } from "@/lib/clients/sonarr";

process.env.CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "jellyshelf-push-"));
const { episodesToSearch } = await import("./push");
await (await import("@/db")).ensureMigrated();

const NOW = Date.parse("2026-10-25T00:00:00Z");
let id = 0;
const ep = (seasonNumber: number, episodeNumber: number, o: Partial<SonarrEpisode> = {}) =>
  ({ id: ++id, seasonNumber, episodeNumber, monitored: true, hasFile: false, airDateUtc: "2026-01-01T00:00:00Z", ...o }) as SonarrEpisode;

it("searches a season's missing, aired, monitored episodes in order", () => {
  const all = [ep(2, 2), ep(1, 1), ep(2, 1), ep(2, 3, { hasFile: true }), ep(2, 4, { airDateUtc: "2026-11-01T00:00:00Z" }), ep(2, 5, { monitored: false }), ep(2, 6, { airDateUtc: undefined })];
  const pick = (eps: SonarrEpisode[]) => eps.map((e) => `${e.seasonNumber}x${e.episodeNumber}`);
  expect(pick(episodesToSearch(all, { absolute: false, seasons: [2] }, NOW))).toEqual(["2x1", "2x2"]);
  // A whole series: every season but specials.
  expect(pick(episodesToSearch([...all, ep(0, 1)], { absolute: true, seasons: null }, NOW))).toEqual(["1x1", "2x1", "2x2"]);
});

it("sends queued searches to Sonarr one at a time, each once per request, then a season search for what wasn't found", async () => {
  const { queueSearch, searchesSent } = await import("./push");
  const log: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const api = {
    episodeSearch: async (ids: number[]) => {
      maxInFlight = Math.max(maxInFlight, ++inFlight);
      log.push(ids.join(","));
      return { id: ids[0] };
    },
    seasonSearch: async (_: number, season: number) => {
      maxInFlight = Math.max(maxInFlight, ++inFlight);
      log.push(`season ${season}`);
      return { id: 0 };
    },
    // 11 is on disk and 12 downloading after the episode searches; 13 wasn't found.
    episodes: async () => [ep(1, 1, { id: 11, hasFile: true }), ep(1, 2, { id: 12 }), ep(1, 3, { id: 13 })],
    queue: async () => [{ episodeId: 12 }],
    waitForCommand: async () => {
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
    },
  } as unknown as import("@/lib/clients/sonarr").SonarrClient;
  const req = (id: number) => ({ id }) as import("@/db/schema").Request;
  const e = (id: number) => ({ id, seriesId: 1, seasonNumber: 1 }) as SonarrEpisode;
  await queueSearch(api, req(1), [e(11), e(12)]);
  await queueSearch(api, req(2), [e(12), e(13)]); // 12 is already waiting
  await queueSearch(api, req(1), [e(11), e(12)]); // the sync re-queueing request 1
  await searchesSent();
  expect(log).toEqual(["11", "12", "13", "season 1"]);
  expect(maxInFlight).toBe(1);
});
