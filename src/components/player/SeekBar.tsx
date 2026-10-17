"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import type { Segment, Trickplay } from "@/lib/playbackTypes";

const JELLY = "linear-gradient(90deg, #aa5cc3, #00a4dc)";
const fmt = (s: number) => {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};

/** Seek bar: drag or click, a time bubble (with a trickplay thumbnail when Jellyfin has them), and intro/outro marks. */
export function SeekBar({
  time,
  duration,
  buffered,
  segments,
  trickplay,
  onSeek,
  onScrub,
}: {
  time: number;
  duration: number;
  buffered: number;
  segments: Segment[];
  trickplay: Trickplay | null;
  onSeek: (t: number) => void;
  onScrub: () => void;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null); // 0–1
  const [drag, setDrag] = useState<number | null>(null);
  const at = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  };
  const pct = (t: number) => (duration ? `${Math.min(100, (t / duration) * 100)}%` : "0%");
  // Jellyfin's runtime can be a little short of the real file, so the time can pass it near the end.
  const shown = drag ?? (duration ? Math.min(1, time / duration) : 0);
  const peek = drag ?? hover;

  // Trickplay: thumbnails are tiled into sheets; find this moment's sheet and offset.
  let thumb: React.CSSProperties | null = null;
  if (trickplay && peek !== null) {
    const n = Math.min(trickplay.count - 1, Math.floor((peek * duration * 1000) / trickplay.interval));
    const perSheet = trickplay.tileWidth * trickplay.tileHeight;
    const sheet = Math.floor(n / perSheet);
    const inSheet = n % perSheet;
    thumb = {
      width: trickplay.width,
      height: trickplay.height,
      backgroundImage: `url("${trickplay.url.replace("{index}", String(sheet))}")`,
      backgroundPosition: `-${(inSheet % trickplay.tileWidth) * trickplay.width}px -${Math.floor(inSheet / trickplay.tileWidth) * trickplay.height}px`,
    };
  }

  return (
    <div
      ref={bar}
      className="group/seek relative flex h-6 cursor-pointer touch-none items-center"
      onClick={(e) => e.stopPropagation()}
      onPointerMove={(e) => {
        setHover(at(e.clientX));
        if (drag !== null) setDrag(at(e.clientX));
        onScrub();
      }}
      onPointerLeave={() => setHover(null)}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag(at(e.clientX));
      }}
      onPointerUp={(e) => {
        if (drag !== null) onSeek(at(e.clientX) * duration);
        setDrag(null);
      }}
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(time)}
    >
      <div className={clsx("relative h-1 w-full overflow-hidden rounded-full bg-white/20 transition-[height] duration-150 group-hover/seek:h-1.5", drag !== null && "h-1.5")}>
        <div className="absolute inset-y-0 left-0 bg-white/30" style={{ width: pct(buffered) }} />
        <div className="absolute inset-y-0 left-0" style={{ width: `${shown * 100}%`, backgroundImage: JELLY }} />
        {segments
          .filter((s) => s.type !== "Commercial")
          .map((s) => (
            <div key={`${s.type}${s.start}`} className="absolute inset-y-0 bg-white/35" style={{ left: pct(s.start), width: pct(s.end - s.start) }} title={s.type} />
          ))}
      </div>
      <div
        className={clsx("absolute h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-white shadow transition-transform duration-150", drag !== null ? "scale-110" : "scale-0 group-hover/seek:scale-100")}
        style={{ left: `${shown * 100}%` }}
      />
      {peek !== null && duration > 0 && (
        <div className="pointer-events-none absolute bottom-6 -translate-x-1/2" style={{ left: `clamp(${thumb ? 90 : 30}px, ${peek * 100}%, calc(100% - ${thumb ? 90 : 30}px))` }}>
          {thumb && <div className="mb-1.5 overflow-hidden rounded-lg border border-white/20 shadow-xl" style={thumb} />}
          <div className="mx-auto w-fit rounded-md bg-black/80 px-2 py-0.5 text-xs tabular-nums">{fmt(peek * duration)}</div>
        </div>
      )}
    </div>
  );
}
