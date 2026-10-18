import { describe, expect, it } from "vitest";
import { trackLabel } from "./langs";

const l = (title: string | null, language: string | null, extra: { hi?: boolean; forced?: boolean } = {}) => trackLabel({ title, language, ...extra }, "Subtitles");

describe("trackLabel", () => {
  it("drops source, group and format tags, leading with the language", () => {
    expect(l("CR", "eng")).toBe("English");
    expect(l("English [NF]", "eng")).toBe("English");
    expect(l("English / SRT", "eng")).toBe("English");
    expect(l("[Erai-raws]_AAC_CR", "jpn")).toBe("Japanese");
    expect(l("Japanese - Opus 2.0", "jpn")).toBe("Japanese");
    expect(l("Dansk", "dan")).toBe("Danish");
    expect(l("العربية", "ara")).toBe("Arabic");
  });

  it("keeps what the title adds", () => {
    expect(l("Brazilian_CR", "por")).toBe("Portuguese · Brazilian");
    expect(l("French (Parisian) / ", "fra")).toBe("French · Parisian");
    expect(l("Dubtitle (SDH)", "eng", { hi: true })).toBe("English · Dubtitle (SDH)");
    expect(l("Forced (Signs only)", "eng", { forced: true })).toBe("English · Forced (Signs only)");
    expect(l("Commentary by David Fincher", "eng")).toBe("English · Commentary by David Fincher");
  });

  it("marks SDH and forced when the title doesn't, and falls back when there's nothing to go on", () => {
    expect(l(null, "eng", { hi: true })).toBe("English · SDH");
    expect(l("English (SDH)", "eng", { hi: true })).toBe("English · SDH");
    expect(l(null, null)).toBe("Subtitles");
    expect(l("Latin American", null)).toBe("Latin American");
  });
});
