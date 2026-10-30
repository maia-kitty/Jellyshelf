import { expect, it } from "vitest";
import { deobfuscate } from "./zoko";

it("reads the embed's config: base64 of the JSON XORed with the rotating key", () => {
  const json = JSON.stringify({ src: "https://host/p/x/master.m3u8", subtitles: [] });
  const key = Buffer.from("otaku-embed-v1");
  const blob = Buffer.from(Buffer.from(json).map((b, i) => b ^ key[i % key.length])).toString("base64");
  expect(deobfuscate(blob)).toEqual({ src: "https://host/p/x/master.m3u8", subtitles: [] });
});
