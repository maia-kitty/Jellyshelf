import { describe, expect, it } from "vitest";

const { stuckReason, mangaStatus, mangaStuck } = await import("./availability");

describe("stuckReason", () => {
  it("is nothing when nothing out is missing", () => {
    expect(stuckReason("Sonarr", [], "episode")).toBeNull();
  });
  it("says when the *arr isn't even looking (what happened to the Rascal film)", () => {
    expect(stuckReason("Sonarr", [{ monitored: false }], "episode")).toBe("Sonarr has 1 aired episode switched off (unmonitored), so it isn't downloading");
  });
  it("otherwise says nothing's been found", () => {
    expect(stuckReason("Radarr", [{ monitored: true }], "film")).toBe("Radarr hasn't found a download for this film yet");
    expect(stuckReason("Sonarr", [{ monitored: true }, { monitored: true }], "episode")).toBe("Sonarr hasn't found a download for 2 aired episodes yet");
  });
});

describe("manga (Mangarr)", () => {
  it("is available once every chapter asked for is on disk, partly while some are missing", () => {
    expect(mangaStatus({ chaptersOnDisk: 0, chaptersMissing: 5 })).toBeNull();
    expect(mangaStatus({ chaptersOnDisk: 3, chaptersMissing: 2 })).toBe("partially_available");
    expect(mangaStatus({ chaptersOnDisk: 5, chaptersMissing: 0 })).toBe("available");
  });
  it("says why a manga is stuck", () => {
    const base = { state: "ok", error: null, monitored: true, chaptersMissing: 0 };
    expect(mangaStuck(base)).toBeNull();
    expect(mangaStuck({ ...base, state: "no_match" })).toMatch(/any of its sources/);
    expect(mangaStuck({ ...base, state: "error", error: "HTTP 503" })).toMatch(/HTTP 503/);
    expect(mangaStuck({ ...base, monitored: false, chaptersMissing: 2 })).toMatch(/unmonitored/);
  });
});
