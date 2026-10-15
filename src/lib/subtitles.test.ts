import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request } from "@/db/schema";
import type { BazarrEpisode } from "@/lib/clients/bazarr";
import { summaryText } from "./subsText";

vi.mock("@/lib/settings", () => ({
  getSettings: async () => ({
    bazarr: { url: "http://bazarr:6767", apiKey: "k", fixSubsBy: "requesters" },
    sonarr: { url: "http://sonarr:8989", apiKey: "k" },
  }),
}));
const { fileSubs, forgetSubs, requestSubs, subLabel, summarize } = await import("./subtitles");

const en = { name: "English", code2: "en", code3: "eng", forced: false, hi: false };
// Shaped like Bazarr 1.6's /api/episodes response.
const ep = (episode: number, have: (typeof en)[], missing: (typeof en)[], season = 1): BazarrEpisode => ({
  sonarrSeriesId: 1,
  sonarrEpisodeId: season * 100 + episode,
  season,
  episode,
  subtitles: have,
  missing_subtitles: missing,
});

describe("labels and summaries", () => {
  it("labels forced and hearing-impaired tracks", () => {
    expect(subLabel(en)).toBe("EN");
    expect(subLabel({ ...en, hi: true })).toBe("EN HI");
    expect(subLabel({ code2: "ja", forced: true, hi: false })).toBe("JA forced");
  });
  it("counts missing languages per file and lists what's there", () => {
    const s = summarize([ep(1, [en], []), ep(2, [], [en]), ep(3, [], [en])].map(fileSubs));
    expect(s).toEqual({ files: 3, have: ["EN"], missing: [{ lang: "EN", files: 2 }] });
    expect(summaryText(s, "episode")).toBe("EN missing on 2 of 3 episodes");
  });
  it("reads as complete, or as missing for a single film", () => {
    expect(summaryText(summarize([fileSubs(ep(1, [en, { ...en, code2: "ja" }], []))]))).toBe("Subtitles ✓ EN · JA");
    expect(summaryText(summarize([fileSubs(ep(1, [], [en]))]))).toBe("No EN subtitles yet");
  });
});

describe("requestSubs", () => {
  const req = (p: Partial<Request>) => ({ target: "sonarr", absolute: false, seasons: null, episodeRanges: null, ...p }) as Request;
  const eps = [ep(1, [en], []), ep(2, [], [en]), ep(3, [], [en]), ep(1, [], [en], 2)];
  afterEach(() => {
    vi.unstubAllGlobals();
    forgetSubs();
  });
  const stub = (sonarrEps: unknown[] = []) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => new Response(JSON.stringify(url.includes("bazarr") ? { data: eps } : sonarrEps), { status: 200 })),
    );

  it("only counts the request's own episodes", async () => {
    stub();
    const s = await requestSubs(req({ seasons: [1], episodeRanges: [{ from: 2, to: 3 }] }), { sonarrId: 1, radarrId: null });
    expect(s).toEqual({ files: 2, have: [], missing: [{ lang: "EN", files: 2 }] });
  });
  it("uses Sonarr's absolute numbers for absolute requests", async () => {
    stub([
      { id: 101, absoluteEpisodeNumber: 1 },
      { id: 102, absoluteEpisodeNumber: 2 },
      { id: 103, absoluteEpisodeNumber: 3 },
      { id: 201, absoluteEpisodeNumber: 4 },
    ]);
    const s = await requestSubs(req({ absolute: true, episodeRanges: [{ from: 3, to: null }] }), { sonarrId: 1, radarrId: null });
    expect(s?.files).toBe(2);
  });
  it("is null without a Sonarr id", async () => {
    expect(await requestSubs(req({ seasons: [1] }), { sonarrId: null, radarrId: null })).toBeNull();
  });
});
