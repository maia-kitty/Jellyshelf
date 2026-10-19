import { describe, expect, it } from "vitest";

const { stuckReason } = await import("./availability");

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
