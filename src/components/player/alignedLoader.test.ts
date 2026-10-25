import { describe, expect, it } from "vitest";
import { segmentStart, videoTrack } from "./alignedLoader";

/** An MP4 box: 32-bit size, type, contents. */
const box = (type: string, ...parts: Uint8Array[]) => {
  const body = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(8 + body);
  new DataView(out.buffer).setUint32(0, 8 + body);
  out.set([...type].map((c) => c.charCodeAt(0)), 4);
  let at = 8;
  for (const p of parts) out.set(p, (at += p.length) - p.length);
  return out;
};
const u32 = (...n: number[]) => {
  const b = new Uint8Array(n.length * 4);
  n.forEach((x, i) => new DataView(b.buffer).setUint32(i * 4, x));
  return b;
};
const text = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

// version 0 boxes: tkhd = flags, created, modified, track id; mdhd = flags, created, modified, timescale; hdlr = flags, pre-defined, handler
const trak = (id: number, timescale: number, handler: string) =>
  box("trak", box("tkhd", u32(0, 0, 0, id)), box("mdia", box("mdhd", u32(0, 0, 0, timescale)), box("hdlr", u32(0, 0), text(handler))));
const init = box("moov", trak(2, 48000, "soun"), trak(1, 16000, "vide"));

describe("aligned loader", () => {
  it("finds the video track's id and timescale", () => {
    expect(videoTrack(init)).toEqual({ id: 1, timescale: 16000 });
  });
  it("reads the video's start from a segment (64-bit tfdt), skipping other tracks", () => {
    const tfdt64 = (t: number) => box("tfdt", new Uint8Array([1, 0, 0, 0]), u32(Math.floor(t / 2 ** 32), t % 2 ** 32));
    const traf = (id: number, t: number) => box("traf", box("tfhd", u32(0, id)), tfdt64(t));
    const seg = new Uint8Array([...box("styp"), ...box("moof", traf(2, 48000 * 700), traf(1, 16000 * 741.24)), ...box("mdat")]);
    expect(segmentStart(seg, { id: 1, timescale: 16000 })).toBeCloseTo(741.24, 3);
  });
  it("gives up on data that isn't an fMP4 segment", () => {
    expect(segmentStart(new Uint8Array([1, 2, 3]), { id: 1, timescale: 16000 })).toBeNull();
    expect(videoTrack(box("free"))).toBeNull();
  });
});
