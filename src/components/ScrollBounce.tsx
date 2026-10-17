"use client";

import { useEffect } from "react";

/**
 * When a sideways row of cards comes to rest, its cards carry on a few pixels the way they were going and spring back,
 * leaning a touch like jelly. The further the scroll, the bigger the bounce. Tab rows (<nav>) stay still.
 */
export function ScrollBounce() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Where each row was when this scroll began, so the bounce can follow how far and which way it went.
    const startAt = new WeakMap<Element, number>();
    const timers = new WeakMap<Element, number>();
    const hasEnd = "onscrollend" in document.documentElement;
    const row = (e: Event) => (e.target instanceof HTMLElement && e.target.matches(".scroll-row:not(nav)") ? e.target : null);

    const settle = (el: HTMLElement) => {
      const moved = el.scrollLeft - (startAt.get(el) ?? el.scrollLeft);
      startAt.delete(el);
      const amp = Math.min(10, Math.abs(moved) / 50);
      if (amp < 1.5) return;
      const d = Math.sign(moved);
      for (const card of el.children) {
        (card as HTMLElement).animate(
          [
            { transform: "none", easing: "cubic-bezier(0.2, 0.7, 0.4, 1)" },
            { transform: `translateX(${-d * amp}px) skewX(${d * amp * 0.18}deg)`, offset: 0.3, easing: "ease-in-out" },
            { transform: `translateX(${d * amp * 0.3}px) skewX(${-d * amp * 0.07}deg)`, offset: 0.65, easing: "ease-in-out" },
            { transform: "none" },
          ],
          { duration: 650 },
        );
      }
    };

    const onScroll = (e: Event) => {
      const el = row(e);
      if (!el) return;
      if (!startAt.has(el)) startAt.set(el, el.scrollLeft);
      // Browsers without a scrollend event (older Safari): call it stopped once it's been still for a moment.
      if (!hasEnd) {
        clearTimeout(timers.get(el));
        timers.set(el, window.setTimeout(() => settle(el), 120));
      }
    };
    const onEnd = (e: Event) => {
      const el = row(e);
      if (el) settle(el);
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
