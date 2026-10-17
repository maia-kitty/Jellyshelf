import { describe, expect, it, vi } from "vitest";
import { matchTitle, type ListEntries } from "./titleMatch";

const t = (english: string | null, romaji: string) => ({ english, romaji, native: null, userPreferred: romaji });
const list: ListEntries = new Map(
  [
    { mediaId: 154587, score: 96, media: { title: t("Frieren: Beyond Journey’s End", "Sousou no Frieren") } },
    { mediaId: 101922, score: 81, media: { title: t("Demon Slayer: Kimetsu no Yaiba", "Kimetsu no Yaiba") } },
    { mediaId: 142329, score: 80, media: { title: t("Demon Slayer: Kimetsu no Yaiba Entertainment District Arc", "Kimetsu no Yaiba: Yuukaku-hen") } },
    { mediaId: 431, score: 83, media: { title: t("Howl's Moving Castle", "Howl no Ugoku Shiro") } },
    { mediaId: 527, score: 70, media: { title: t("Pokémon: The First Movie", "Pokémon: Mewtwo no Gyakushuu") } },
  ].map((e) => [e.mediaId, e]),
);
const noSearch = vi.fn(async () => null);

describe("matchTitle", () => {
  it("strips season suffixes and uses the user's list", async () => {
    expect(await matchTitle("Frieren S1", 96, list, noSearch)).toBe(154587);
    expect(await matchTitle("Frieren season 1", 97, list, noSearch)).toBe(154587);
  });
  it("disambiguates by matching score", async () => {
    expect(await matchTitle("demon slayer", 81, list, noSearch)).toBe(101922);
  });
  it("ignores curly vs straight apostrophes and case", async () => {
    expect(await matchTitle("Howl‘s Moving Castle", 83, list, noSearch)).toBe(431);
  });
  it("matches romaji titles", async () => {
    expect(await matchTitle("sousou no frieren", 96, list, noSearch)).toBe(154587);
  });
  it("falls back to search when nothing on the list matches", async () => {
    const search = vi.fn(async (q: string) => (q === "Chainsaw Man" ? 127230 : null));
    expect(await matchTitle("Chainsaw Man", 96, list, search)).toBe(127230);
    expect(noSearch).not.toHaveBeenCalled();
  });
  it("ignores accents either way round", async () => {
    const search = vi.fn(async () => null);
    expect(await matchTitle("Pokemon: The First Movie", 70, list, search)).toBe(527);
    expect(search).not.toHaveBeenCalled();
  });
});
