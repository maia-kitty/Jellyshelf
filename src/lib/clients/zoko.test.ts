import { expect, it } from "vitest";
import { deobfuscate, rewritePlaylist } from "./zoko";

it("reads the embed's config: base64 of the JSON XORed with the rotating key", () => {
  const json = JSON.stringify({ src: "https://host/p/x/master.m3u8", subtitles: [] });
  const key = Buffer.from("otaku-embed-v1");
  const blob = Buffer.from(Buffer.from(json).map((b, i) => b ^ key[i % key.length])).toString("base64");
  expect(deobfuscate(blob)).toEqual({ src: "https://host/p/x/master.m3u8", subtitles: [] });
});

it("points every playlist link through the proxy, relative ones resolved first", () => {
  const playlist = ["#EXTM3U", '#EXT-X-KEY:METHOD=AES-128,URI="key.bin"', "#EXTINF:4.2,", "https://cdn/s/1080/seg_0.ts.jpg", "#EXTINF:4.2,", "seg_1.ts", ""].join("\n");
  expect(rewritePlaylist(playlist, "https://host/p/x/1080/index.m3u8", (u) => `P(${u})`).split("\n")).toEqual([
    "#EXTM3U",
    '#EXT-X-KEY:METHOD=AES-128,URI="P(https://host/p/x/1080/key.bin)"',
    "#EXTINF:4.2,",
    "P(https://cdn/s/1080/seg_0.ts.jpg)",
    "#EXTINF:4.2,",
    "P(https://host/p/x/1080/seg_1.ts)",
    "",
  ]);
});
