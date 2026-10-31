import { describe, expect, it } from "vitest";
import { requestScope } from "./requestScope";

describe("requestScope", () => {
  const manga = { target: "mangarr" as const, seasons: null, episodeRanges: null, absolute: false };
  it("describes manga requests by their start chapter", () => {
    expect(requestScope({ ...manga, startChapter: null })).toBe("Every chapter");
    expect(requestScope({ ...manga, startChapter: 0 })).toBe("Every chapter");
    expect(requestScope({ ...manga, startChapter: 139 })).toBe("From chapter 139");
  });
  it("leaves series requests as they were", () => {
    expect(requestScope({ target: "sonarr", seasons: [2], episodeRanges: null, absolute: false })).toBe("S2");
  });
});
