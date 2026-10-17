"use client";

import { useEffect } from "react";

// A soft spring: the cards bunch up, spring back a little past where they were, and settle.
const FREQ = 2.2;
const DAMPING = 0.45;
const MS = 1000;
const STEPS = 66;

/** The spring's path after a sudden stop, sampled for keyframes, peaking at 1. */
const SPRING = (() => {
  const w = 2 * Math.PI * FREQ;
  const wd = w * Math.sqrt(1 - DAMPING * DAMPING);
  const pos = Array.from({ length: STEPS + 1 }, (_, i) => Math.exp((-DAMPING * w * i * MS) / STEPS / 1000) * Math.sin((wd * i * MS) / STEPS / 1000));
  const max = Math.max(...pos);
  return pos.map((p) => p / max);
})();

/**
 * When a sideways row of cards runs into its start or end, the cards bunch up against that edge (the gaps between them
 * closing, more the harder it hit) and spring back apart. The push starts at the far end and travels into the edge, the
 * way you were scrolling. Stopping anywhere else does nothing. Tab rows (<nav>) stay still.
 */
export function ScrollBounce() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Per row: where it last was and when, how fast it's going (px/s), and whether it's already bounced off this edge.
    const track = new WeakMap<Element, { x: number; t: number; v: number; hit: boolean }>();
    const row = (e: Event) => (e.target instanceof HTMLElement && e.target.matches(".scroll-row:not(nav)") ? e.target : null);

    const bounce = (el: HTMLElement, speed: number) => {
      const d = Math.sign(speed);
      const box = el.getBoundingClientRect();
      // The cards in view, nearest the edge it hit first.
      const cards = [...el.children]
        .map((c) => ({ c, r: c.getBoundingClientRect() }))
        .filter(({ r }) => r.right > box.left && r.left < box.right)
        .sort((a, b) => (d > 0 ? b.r.right - a.r.right : a.r.left - b.r.left));
      if (cards.length < 2) return;
      // How much each gap between cards closes up: more the harder it hit, at most most of the gap.
      const gap = Math.abs(cards[1].r.left - cards[0].r.right) || Math.abs(cards[0].r.left - cards[1].r.right);
      const close = Math.min(gap * 0.7, Math.abs(speed) / 250);
      if (close < 1) return;
      cards.forEach(({ c }, i) => {
        // Each card moves into the edge by the gaps it closes, so they bunch up the way you were scrolling.
        const frames = SPRING.map((p) => ({ transform: `translateX(${d * close * (i + 0.3) * p}px)` }));
        // The far end goes first and the push travels into the edge, the way you were going.
        c.animate(frames, { duration: MS, delay: (cards.length - 1 - i) * 25, easing: "linear" });
      });
    };

    const onScroll = (e: Event) => {
      const el = row(e);
      if (!el) return;
      const now = performance.now();
      const x = el.scrollLeft;
      const s = track.get(el) ?? { x, t: now, v: 0, hit: false };
      const v = ((x - s.x) / Math.max(16, now - s.t)) * 1000;
      // Smoothed, so one uneven frame doesn't read as a burst of speed; a fresh scroll after a pause starts from scratch.
      s.v = now - s.t > 150 ? v : s.v * 0.5 + v * 0.5;
      [s.x, s.t] = [x, now];
      track.set(el, s);
      const atEdge = (s.v < 0 && x <= 0.5) || (s.v > 0 && x >= el.scrollWidth - el.clientWidth - 0.5);
      if (atEdge && !s.hit) bounce(el, s.v);
      s.hit = atEdge;
    };
    // Scroll events don't bubble; listening in the capture phase catches every row on every page.
    document.addEventListener("scroll", onScroll, true);
    return () => document.removeEventListener("scroll", onScroll, true);
  }, []);
  return null;
}
