"use client";

import { useEffect } from "react";

// A loose spring: about 2.4 swings a second, losing most of its swing each time round.
const FREQ = 2.4;
const DAMPING = 0.3;
const MS = 1100;
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
 * When a sideways row of cards comes to rest, the cards wobble on a spring as if they had momentum of their own: the
 * faster you were scrolling (or the harder the row hit its end), the further they swing. They lean while they move, and
 * the wobble ripples along the row from the front. Tab rows (<nav>) stay still.
 */
export function ScrollBounce() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const track = new WeakMap<Element, { x: number; t: number; v: number; peak: number }>();
    const timers = new WeakMap<Element, number>();
    const hasEnd = "onscrollend" in document.documentElement;
    const row = (e: Event) => (e.target instanceof HTMLElement && e.target.matches(".scroll-row:not(nav)") ? e.target : null);

    const settle = (el: HTMLElement) => {
      const s = track.get(el);
      track.delete(el);
      if (!s) return;
      // How fast it was going, px/s: mostly the top speed of this scroll, so a quick flick that glides to a stop still
      // counts, plus the speed right at the end, which is what a row slamming into its end has.
      const speed = Math.max(Math.abs(s.peak) * 0.6, Math.abs(s.v));
      const amp = Math.min(16, speed / 220);
      if (amp < 1) return;
      const d = Math.sign(s.peak || s.v);
      const lean = Math.min(3, amp * 0.22);
      const frames = SPRING.map(({ p, v }) => ({ transform: `translateX(${-d * amp * p}px) skewX(${d * lean * v}deg)` }));
      const box = el.getBoundingClientRect();
      // Only the cards in view, counted from the edge they're heading towards: that one moves first, the rest follow.
      const cards = [...el.children].filter((c) => {
        const r = c.getBoundingClientRect();
        return r.right > box.left && r.left < box.right;
      });
      if (d < 0) cards.reverse();
      cards.forEach((c, i) => c.animate(frames, { duration: MS, delay: i * 28, easing: "linear" }));
    };

    // "Stopped" is still for a moment: a mouse wheel reports an end after every notch, which isn't the end of the scroll.
    const later = (el: HTMLElement, ms: number) => {
      clearTimeout(timers.get(el));
      timers.set(el, window.setTimeout(() => settle(el), ms));
    };
    const onScroll = (e: Event) => {
      const el = row(e);
      if (!el) return;
      const now = performance.now();
      const s = track.get(el);
      if (!s) track.set(el, { x: el.scrollLeft, t: now, v: 0, peak: 0 });
      else {
        // Smoothed, so one uneven frame doesn't read as a burst of speed.
        const v = ((el.scrollLeft - s.x) / Math.max(16, now - s.t)) * 1000;
        s.v = s.v * 0.5 + v * 0.5;
        if (Math.abs(s.v) > Math.abs(s.peak)) s.peak = s.v;
        s.x = el.scrollLeft;
        s.t = now;
      }
      // Browsers without a scrollend event (older Safari) only get the quiet spell to go on.
      later(el, hasEnd ? 400 : 120);
    };
    const onEnd = (e: Event) => {
      const el = row(e);
      if (el && track.has(el)) later(el, 60);
    };
    // Scroll events don't bubble; listening in the capture phase catches every row on every page.
    document.addEventListener("scroll", onScroll, true);
    document.addEventListener("scrollend", onEnd, true);
    return () => {
      document.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("scrollend", onEnd, true);
    };
  }, []);
  return null;
}
