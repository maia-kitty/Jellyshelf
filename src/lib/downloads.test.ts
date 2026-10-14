import { describe, expect, it } from "vitest";
import type { Request } from "@/db/schema";
import type { QueueRecord } from "@/lib/clients/arr";
import { inScope, parseTimeleft, progressFor } from "./downloads";

const req = (p: Partial<Request>) => ({ target: "sonarr", absolute: false, seasons: null, episodeRanges: null, ...p }) as Request;
const ep = (seasonNumber: number, episodeNumber: number, absoluteEpisodeNumber?: number) => ({ seasonNumber, episodeNumber, absoluteEpisodeNumber });
const rec = (p: Partial<QueueRecord>): QueueRecord => ({ id: 1, size: 100, sizeleft: 50, status: "downloading", ...p });

describe("parseTimeleft", () => {
  it("reads hh:mm:ss and d.hh:mm:ss", () => {
    expect(parseTimeleft("00:12:30")).toBe(750);
    expect(parseTimeleft("1.02:00:00")).toBe(93600);
    expect(parseTimeleft(undefined)).toBeNull();
  });
});

describe("inScope", () => {
  it("matches a split-cour range within a season", () => {
    const r = req({ seasons: [3], episodeRanges: [{ from: 13, to: 22 }] });
    expect(inScope(ep(3, 13), r)).toBe(true);
    expect(inScope(ep(3, 12), r)).toBe(false);
    expect(inScope(ep(2, 15), r)).toBe(false);
  });
  it("matches absolute ranges and whole series", () => {
    expect(inScope(ep(21, 5, 1100), req({ absolute: true, episodeRanges: [{ from: 1089, to: null }] }))).toBe(true);
    expect(inScope(ep(1, 1, 1), req({ absolute: true }))).toBe(true);
  });
  it("matches whole seasons", () => {
    expect(inScope(ep(2, 4), req({ seasons: [1, 2] }))).toBe(true);
    expect(inScope(ep(3, 4), req({ seasons: [1, 2] }))).toBe(false);
  });
});

describe("progressFor", () => {
  const media = { sonarrId: 7, radarrId: 3 };
  it("adds up the request's own episodes and ignores the rest of the series", () => {
    const queues = {
      sonarr: [
        rec({ id: 1, seriesId: 7, episode: ep(3, 13), size: 100, sizeleft: 0, timeleft: "00:00:00" }),
        rec({ id: 2, seriesId: 7, episode: ep(3, 14), size: 100, sizeleft: 100, timeleft: "00:10:00" }),
        rec({ id: 3, seriesId: 7, episode: ep(1, 1), size: 1000, sizeleft: 1000 }), // another request's season
        rec({ id: 4, seriesId: 9, episode: ep(3, 13) }), // another series
      ],
      radarr: [],
    };
    const p = progressFor(req({ seasons: [3], episodeRanges: [{ from: 13, to: 22 }] }), media, queues)!;
    expect(p.progress).toBe(0.5);
    expect(p.items).toBe(2);
    expect(p.secondsLeft).toBe(600);
    expect(p.state).toBe("downloading");
  });
  it("counts a season pack once even though it lists every episode", () => {
    const pack = { id: 5, seriesId: 7, size: 1000, sizeleft: 250 };
    const p = progressFor(req({ seasons: [1] }), media, { sonarr: [rec({ ...pack, episode: ep(1, 1) }), rec({ ...pack, episode: ep(1, 2) })], radarr: [] })!;
    expect(p.progress).toBe(0.75);
    expect(p.items).toBe(2);
  });
  it("flags stuck downloads with the reason, and finds movies by Radarr id", () => {
    const p = progressFor(req({ target: "radarr" }), media, {
      sonarr: [],
      radarr: [rec({ movieId: 3, trackedDownloadStatus: "warning", statusMessages: [{ title: "x", messages: ["No files found are eligible for import"] }] })],
    })!;
    expect(p.state).toBe("stuck");
    expect(p.message).toBe("No files found are eligible for import");
  });
  it("is null when nothing of the request is queued", () => {
    expect(progressFor(req({ seasons: [1] }), media, { sonarr: [], radarr: [] })).toBeNull();
  });
});
