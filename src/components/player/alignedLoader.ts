import type Hls from "hls.js";
import type { FragmentLoaderContext, Loader, LoaderCallbacks, LoaderConfiguration, LoaderContext } from "hls.js";

/** The boxes directly inside `data[from, to)`: [type, start of contents, end]. */
function* boxes(data: Uint8Array, from = 0, to = data.length): Generator<[string, number, number]> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let at = from; at + 8 <= to; ) {
    let size = view.getUint32(at);
    let head = 8;
    if (size === 1) {
      size = Number(view.getBigUint64(at + 8));
      head = 16;
    } else if (size === 0) size = to - at;
    if (size < head || at + size > to) return;
    yield [String.fromCharCode(...data.subarray(at + 4, at + 8)), at + head, at + size];
    at += size;
  }
}

const child = (data: Uint8Array, path: string[], from = 0, to = data.length): [number, number] | null => {
  for (const [type, start, end] of boxes(data, from, to)) {
    if (type !== path[0]) continue;
    return path.length === 1 ? [start, end] : child(data, path.slice(1), start, end);
  }
  return null;
};

/** The video track's id and timescale, from an fMP4 init segment. */
export function videoTrack(init: Uint8Array): { id: number; timescale: number } | null {
  const moov = child(init, ["moov"]);
  if (!moov) return null;
  const view = new DataView(init.buffer, init.byteOffset, init.byteLength);
  for (const [type, start, end] of boxes(init, ...moov)) {
    if (type !== "trak") continue;
    const hdlr = child(init, ["mdia", "hdlr"], start, end);
    if (!hdlr || String.fromCharCode(...init.subarray(hdlr[0] + 8, hdlr[0] + 12)) !== "vide") continue;
    const tkhd = child(init, ["tkhd"], start, end);
    const mdhd = child(init, ["mdia", "mdhd"], start, end);
    if (!tkhd || !mdhd) return null;
    const v1 = (b: number) => init[b] === 1; // version 1 boxes have 64-bit times before the field we want
    return { id: view.getUint32(tkhd[0] + (v1(tkhd[0]) ? 20 : 12)), timescale: view.getUint32(mdhd[0] + (v1(mdhd[0]) ? 20 : 12)) };
  }
  return null;
}

/** When a media segment's video starts (its first decode time), in seconds. */
export function segmentStart(segment: Uint8Array, track: { id: number; timescale: number }): number | null {
  const view = new DataView(segment.buffer, segment.byteOffset, segment.byteLength);
  for (const [type, start, end] of boxes(segment)) {
    if (type !== "moof") continue;
    for (const [t, s, e] of boxes(segment, start, end)) {
      if (t !== "traf") continue;
      const tfhd = child(segment, ["tfhd"], s, e);
      const tfdt = child(segment, ["tfdt"], s, e);
      if (!tfhd || !tfdt || view.getUint32(tfhd[0] + 4) !== track.id) continue;
      const time = segment[tfdt[0]] === 1 ? Number(view.getBigUint64(tfdt[0] + 4)) : view.getUint32(tfdt[0] + 4);
      return time / track.timescale;
    }
  }
  return null;
}

/**
 * A fragment loader that places each segment where its own timestamps say it belongs, instead of where the playlist
 * says. Jellyfin's remuxed HLS keeps the file's real timestamps, but after a seek restarts ffmpeg mid-file, its
 * segments are cut differently from Jellyfin's playlist (seconds apart). Loaded straight after a seek, such a segment
 * makes hls.js shift its whole timeline to fit the playlist, which puts every subtitle seconds off from then on.
 */
export function alignedLoader(H: typeof Hls) {
  const Base = H.DefaultConfig.loader as unknown as new (config: unknown) => Loader<LoaderContext>;
  return class AlignedLoader extends Base {
    load(context: LoaderContext, config: LoaderConfiguration, callbacks: LoaderCallbacks<LoaderContext>) {
      super.load(context, config, {
        ...callbacks,
        onSuccess: (response, stats, ctx, details) => {
          const frag = (ctx as FragmentLoaderContext).frag;
          const init = frag?.initSegment?.data;
          if (frag && frag.sn !== "initSegment" && init && response.data instanceof ArrayBuffer) {
            const track = videoTrack(init);
            const start = track && segmentStart(new Uint8Array(response.data), track);
            // Half a second covers ordinary decode/presentation offsets; anything more is a mis-cut segment.
            if (start !== null && start !== undefined && Math.abs(start - frag.start) > 0.5) frag.setStart(start);
          }
          callbacks.onSuccess(response, stats, ctx, details);
        },
      });
    }
  };
}
