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

type Line = { items: Element[]; start: number; end: number };

/**
 * When a list runs into its start or end, its items bunch up against that edge (the gaps between them closing, more the
 * harder it hit) and spring back apart. The push starts at the far end and travels into the edge, the way you were
 * scrolling. Stopping anywhere else does nothing.
 *
 * Sideways: the card rows (.scroll-row; tab rows, which are <nav>s, stay still). Up and down: lists marked .bounce-y,
 * when the page (or a box they scroll inside, like a dropdown) hits its top or bottom; a grid's rows move as one.
 */
export function ScrollBounce() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Per scroller: where it last was and when, how fast it's going (px/s), and whether it's already bounced off this edge.
    const track = new WeakMap<Element, { x: number; t: number; v: number; hit: boolean }>();

    const bounce = (el: Element, speed: number, across: boolean) => {
      const d = Math.sign(speed);
      const page = el === document.scrollingElement;
      const box = page ? new DOMRect(0, 0, innerWidth, innerHeight) : el.getBoundingClientRect();
      const [lo, hi] = across ? (["left", "right"] as const) : (["top", "bottom"] as const);
      // The items in view, in lines across the way it scrolls (a grid's rows; a card row's cards each on their own).
      const lines: Line[] = [];
      for (const c of across ? el.children : el.querySelectorAll(".bounce-y > :not([aria-hidden])")) {
        const r = c.getBoundingClientRect();
        if (r[hi] <= box[lo] || r[lo] >= box[hi]) continue;
        const line = lines.find((l) => Math.abs(l.start - r[lo]) < 4);
        if (line) [line.items, line.end] = [[...line.items, c], Math.max(line.end, r[hi])];
        else lines.push({ items: [c], start: r[lo], end: r[hi] });
      }
      if (lines.length < 2) return;
      // Nearest the edge it hit first.
      lines.sort((a, b) => (d > 0 ? b.end - a.end : a.start - b.start));
      // How much each gap closes up: more the harder it hit, at most most of the gap. Lists with no gaps between their
      // rows (divided lists) still nudge a little into each row's padding.
      const gap = d > 0 ? lines[0].start - lines[1].end : lines[1].start - lines[0].end;
      const close = Math.min(Math.max(gap, 8) * 0.7, Math.abs(speed) / 250);
      if (close < 1) return;
      const axis = across ? "X" : "Y";
      lines.forEach((line, i) => {
        // Each line moves into the edge by the gaps it closes, so they bunch up the way you were scrolling.
        const frames = SPRING.map((p) => ({ transform: `translate${axis}(${d * close * (i + 0.3) * p}px)` }));
        // The far end goes first and the push travels into the edge, the way you were going.
        for (const c of line.items) c.animate(frames, { duration: MS, delay: (lines.length - 1 - i) * 25, easing: "linear" });
      });
    };

    const onScroll = (e: Event) => {
      const el = e.target === document ? document.scrollingElement : e.target instanceof HTMLElement ? e.target : null;
      if (!el) return;
      const across = el.matches(".scroll-row:not(nav)");
      if (!across && !el.querySelector(".bounce-y")) return;
      const now = performance.now();
      const x = across ? el.scrollLeft : el.scrollTop;
      const max = across ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight;
      const s = track.get(el) ?? { x, t: now, v: 0, hit: false };
      const v = ((x - s.x) / Math.max(16, now - s.t)) * 1000;
      // Smoothed, so one uneven frame doesn't read as a burst of speed; a fresh scroll after a pause starts from scratch.
      s.v = now - s.t > 150 ? v : s.v * 0.5 + v * 0.5;
      [s.x, s.t] = [x, now];
      track.set(el, s);
      const atEdge = (s.v < 0 && x <= 0.5) || (s.v > 0 && x >= max - 0.5);
      if (atEdge && !s.hit) bounce(el, s.v, across);
      s.hit = atEdge;
    };
    // Scroll events don't bubble; listening in the capture phase catches every scroller on every page.
    document.addEventListener("scroll", onScroll, true);
    return () => document.removeEventListener("scroll", onScroll, true);
  }, []);
  return null;
}
