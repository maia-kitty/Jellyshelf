"use client";

import { useEffect } from "react";

// A soft spring: one push the way the row was going, a small swing back, and still.
const FREQ = 2.2;
const DAMPING = 0.45;
const MS = 1000;
const STEPS = 66;

/**
 * The spring's path after a sudden stop, as offsets of up to ±1 (position) and its speed at each step (also up to ±1),
 * sampled for keyframes: it carries on, swings back past rest, and settles.
 */
const SPRING = (() => {
  const w = 2 * Math.PI * FREQ;
  const wd = w * Math.sqrt(1 - DAMPING * DAMPING);
  const pos = Array.from({ length: STEPS + 1 }, (_, i) => {
    const t = (i / STEPS) * (MS / 1000);
    return Math.exp(-DAMPING * w * t) * Math.sin(wd * t);
  });
  const vel = pos.map((p, i) => (pos[Math.min(STEPS, i + 1)] - pos[Math.max(0, i - 1)]) / 2);
  const pMax = Math.max(...pos.map(Math.abs));
  const vMax = Math.max(...vel.map(Math.abs));
  return pos.map((p, i) => ({ p: p / pMax, v: vel[i] / vMax }));
})();

/**
 * When a sideways row of cards runs into its start or end, the cards wobble on a spring as if they had momentum of their
 * own: the faster it hit, the further they swing. The wobble goes the way you were scrolling: it starts at the edge it
 * hit, and the row squishes into that edge like one piece of jelly (the cards there squashing most, the far ones
 * sliding furthest) and springs back, leaning as it moves. Stopping anywhere else does nothing. Tab rows (<nav>) stay still.
 */
export function ScrollBounce() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Per row: where it last was and when, how fast it's going (px/s), and whether it's already bounced off this edge.
    const track = new WeakMap<Element, { x: number; t: number; v: number; hit: boolean }>();
    const row = (e: Event) => (e.target instanceof HTMLElement && e.target.matches(".scroll-row:not(nav)") ? e.target : null);

    const bounce = (el: HTMLElement, speed: number) => {
      // How far the furthest card slides.
      const amp = Math.min(24, Math.abs(speed) / 150);
      if (amp < 1.5) return;
      const d = Math.sign(speed);
      const box = el.getBoundingClientRect();
      // The row squishes into the edge it hit like one piece of jelly: hardest at the edge and easing off over about
      // SOFT px, so the cards there squash (and bulge) the most and the further ones slide the most.
      const SOFT = 300;
      const squash = amp / SOFT;
      const lean = Math.min(2.5, amp * 0.12);
      // Only the cards in view, by how far each one's middle is from the edge it hit; nearest moves first.
      const cards = [...el.children]
        .map((c) => {
          const r = c.getBoundingClientRect();
          const mid = (r.left + r.right) / 2;
          return { c, r, far: d > 0 ? box.right - mid : mid - box.left };
        })
        .filter(({ r }) => r.right > box.left && r.left < box.right)
        .sort((a, b) => a.far - b.far);
      cards.forEach(({ c, far }, i) => {
        const strain = squash * Math.exp(-far / SOFT);
        const slide = amp * (1 - Math.exp(-far / SOFT));
        // Towards the edge the way you were scrolling, squashed along the row and bulging a little, leaning into the move.
        const frames = SPRING.map(({ p, v }) => ({
          transform: `translateX(${d * slide * p}px) scale(${1 - strain * p}, ${1 + strain * p * 0.5}) skewX(${-d * lean * v}deg)`,
        }));
        c.animate(frames, { duration: MS, delay: i * 28, easing: "linear" });
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
