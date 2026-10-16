import { describe, expect, it } from "vitest";
import { sized } from "./img";

const XL = "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1-a.jpg";
const L = "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx1-a.jpg";

describe("sized", () => {
  it("offers TMDB's own sizes for 1×–3× screens", () => {
    const s = sized("https://image.tmdb.org/t/p/w342/p.jpg", 160);
    expect(s.src).toBe("https://image.tmdb.org/t/p/w185/p.jpg");
    expect(s.srcSet).toBe("https://image.tmdb.org/t/p/w185/p.jpg 185w, https://image.tmdb.org/t/p/w342/p.jpg 342w, https://image.tmdb.org/t/p/w500/p.jpg 500w");
    expect(s.sizes).toBe("160px");
  });
  it("never sends TMDB originals for backdrops", () => {
    const s = sized("https://image.tmdb.org/t/p/original/b.jpg", 1600, "100vw");
    expect(s.srcSet).toContain("/w1280/b.jpg 1280w");
    expect(s.srcSet).not.toContain("original");
  });
  it("uses AniList's 230 px cover for thumbnails and the optimizer for anything bigger", () => {
    expect(sized(XL, 48)).toEqual({ src: L });
    expect(sized(XL.replace(".jpg", ".png"), 48).src).toBe(`/_next/image?url=${encodeURIComponent(L.replace(".jpg", ".png"))}&w=48&q=72`);
    const s = sized(L, 160);
    expect(s.src).toBe(`/_next/image?url=${encodeURIComponent(XL)}&w=160&q=72`);
    expect(s.srcSet?.split(", ").map((x) => x.split(" ")[1])).toEqual(["160w", "320w", "480w"]);
  });
  it("doesn't ask for a large copy of older covers that have none", () => {
    const old = "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/b159110-h47FGDUBilAy.png";
    expect(sized(old, 160).src).toBe(`/_next/image?url=${encodeURIComponent(old)}&w=160&q=72`);
  });
  it("asks Jellyfin for the width it needs", () => {
    const s = sized("/api/jf/Items/abc/Images/Primary?maxWidth=360&tag=t", 160);
    expect(s.src).toBe("/api/jf/Items/abc/Images/Primary?maxWidth=160&tag=t&quality=85");
    expect(s.srcSet).toContain("maxWidth=480");
  });
  it("leaves anything else alone", () => {
    expect(sized("https://example.com/a.png", 100)).toEqual({ src: "https://example.com/a.png" });
    expect(sized(null, 100)).toEqual({ src: "" });
  });
});
