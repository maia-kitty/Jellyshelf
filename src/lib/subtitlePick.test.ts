import { describe, expect, it } from "vitest";
import { pickSubtitle } from "./subtitlePick";
import type { SubtitleTrack } from "./playbackTypes";

const t = (index: number, language: string | null, kind: SubtitleTrack["kind"], extra: Partial<SubtitleTrack> = {}): SubtitleTrack => ({
  index,
  label: `#${index}`,
  language,
  isDefault: false,
  isForced: false,
  hi: false,
  kind,
  url: null,
  ...extra,
});

// Laid out like Lycoris Recoil: an SDH text track first, signs-only, the main styled track, a styled SDH one.
const lycoris = [t(0, "eng", "vtt", { hi: true }), t(4, "eng", "ass", { isForced: true }), t(5, "eng", "ass", { isDefault: true }), t(6, "eng", "ass", { hi: true })];
// Like Mr. Robot: the SDH track comes before the plain one.
const robot = [t(0, "eng", "vtt", { hi: true }), t(3, "eng", "vtt")];
// Like Fight Club: SDH text, a plain image track (burned in), a plain text one, an SDH image one.
const fightClub = [t(0, "eng", "vtt", { hi: true }), t(7, "eng", "burn"), t(8, "eng", "vtt"), t(9, "eng", "burn", { hi: true })];

describe("pickSubtitle", () => {
  it("keeps to plain subtitles when that's what you picked, even when SDH comes first", () => {
    expect(pickSubtitle(robot, { lang: "eng", hi: false }, null)?.index).toBe(3);
    expect(pickSubtitle(robot, { lang: "eng", hi: true }, null)?.index).toBe(0);
  });

  it("prefers a text track to an image one that would have to be burned in", () => {
    expect(pickSubtitle(fightClub, { lang: "eng", hi: false }, null)?.index).toBe(8);
    expect(pickSubtitle(fightClub, { lang: "eng", hi: true }, null)?.index).toBe(0);
  });

  it("never lands on a signs-only track, and moves to the styled track of the same kind", () => {
    expect(pickSubtitle(lycoris, { lang: "eng", hi: false }, null)?.index).toBe(5);
    expect(pickSubtitle(lycoris, { lang: "eng", hi: true }, null)?.index).toBe(6);
  });

  it("falls back to the stream's choice, then the default; 'off' means none", () => {
    expect(pickSubtitle(robot, { lang: null, hi: false }, 3)?.index).toBe(3);
    expect(pickSubtitle(lycoris, { lang: "jpn", hi: false }, null)?.index).toBe(5);
    expect(pickSubtitle(robot, { lang: "off", hi: false }, 0)).toBeNull();
  });
});
