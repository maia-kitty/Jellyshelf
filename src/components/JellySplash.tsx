"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { AppIcon } from "./AppIcon";

/** Small deterministic PRNG so a given seed always splats the same way. */
function rng(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const pct = (r: () => number) => `${Math.round(38 + r() * 24)}%`;

/**
 * Full-screen jelly burst from an anchor element (the jar): a flood that fills the page plus a ring of
 * irregular splats, then the whole thing fades out (keyframes in globals.css). Skipped entirely for
 * reduced-motion users. Calls onDone when finished so the parent can unmount it.
 */
export function JellySplash({ anchor, onDone, seed = 7 }: { anchor: RefObject<HTMLElement | null>; onDone?: () => void; seed?: number }) {
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onDone?.();
      return;
    }
    const r = anchor.current?.getBoundingClientRect();
    // burst from the jar's mouth (upper part of the icon)
    setOrigin(r ? { x: r.left + r.width / 2, y: r.top + r.height * 0.3 } : { x: innerWidth / 2, y: innerHeight / 2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const splats = useMemo(() => {
    const r = rng(seed);
    const n = 16;
    return Array.from({ length: n }, (_, i) => {
      const angle = (i / n) * Math.PI * 2 + r() * 0.5;
      const dist = 16 + r() * 52; // vmax
      return {
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist * 0.85 + 5, // a little gravity
        size: 5 + r() * 17, // vmax
        delay: 0.5 + r() * 0.2,
        rot: Math.round(r() * 360),
        radius: `${pct(r)} ${pct(r)} ${pct(r)} ${pct(r)} / ${pct(r)} ${pct(r)} ${pct(r)} ${pct(r)}`,
        light: r() > 0.5,
      };
    });
  }, [seed]);

  if (!origin) return null;
  return (
    <div
      className="jelly-splash"
      style={{ "--ox": `${origin.x}px`, "--oy": `${origin.y}px` } as React.CSSProperties}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget) onDone?.();
      }}
      aria-hidden="true"
    >
      <div className="jelly-blob jelly-flood" />
      {splats.map((s, i) => (
        <div
          key={i}
          className={`jelly-blob jelly-splat${s.light ? " jelly-light" : ""}`}
          style={
            {
              "--dx": `${s.dx}vmax`,
              "--dy": `${s.dy}vmax`,
              "--s": `${s.size}vmax`,
              "--d": `${s.delay}s`,
              "--r": `${s.rot}deg`,
              borderRadius: s.radius,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** The sign-in page jar: the lid pops open, then jelly bursts over the page and fades away. */
export function IntroJar({ size = 64 }: { size?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [done, setDone] = useState(false);
  return (
    <div ref={ref} className="mx-auto w-fit text-fg">
      <AppIcon size={size} animate="intro" />
      {!done && <JellySplash anchor={ref} onDone={() => setDone(true)} />}
    </div>
  );
}
