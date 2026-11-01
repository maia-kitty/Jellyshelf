"use client";

import { useEffect } from "react";

/** On when the account menu's "Smooth scrolling" is ticked (per browser; off by default, browsers like Zen do it already). */
export const SMOOTH_KEY = "smoothScroll";
export const smoothOn = () => {
  try {
    return localStorage.getItem(SMOOTH_KEY) === "1";
  } catch {
    return false;
  }
};

/** A mouse wheel's notches (not a touchpad, which scrolls smoothly on its own): whole lines, or Chromium's 120 steps. */
function isWheel(e: WheelEvent) {
  const legacy = (e as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY;
  return e.deltaMode !== 0 || (!!legacy && legacy % 120 === 0);
}

/** What a vertical wheel turn over `t` scrolls: the nearest list that can still move that way, else the page. */
function scroller(t: EventTarget | null, down: boolean): HTMLElement | null {
  for (let el = t instanceof Element ? t : null; el && el !== document.body; el = el.parentElement) {
    const y = getComputedStyle(el).overflowY;
    if ((y === "auto" || y === "scroll") && el.scrollHeight > el.clientHeight) {
      const room = down ? el.scrollHeight - el.clientHeight - el.scrollTop : el.scrollTop;
      if (room > 1 && el instanceof HTMLElement) return el;
    }
  }
  return document.scrollingElement instanceof HTMLElement ? document.scrollingElement : null;
}

/**
 * Smooth mouse-wheel scrolling for browsers that step (e.g. Helium): each notch eases to where it's going instead of
 * jumping. Touchpads, zooming (Ctrl) and sideways scrolling are left to the browser.
 */
export function SmoothScroll() {
  useEffect(() => {
    let el: HTMLElement | null = null;
    let target = 0;
    let frame = 0;
    let last = 0;
    const step = (now: number) => {
      if (!el) return;
      const dt = Math.min(50, now - last);
      last = now;
      const pos = el.scrollTop;
      // Closes ~90% of the gap every 100 ms whatever the frame rate.
      const next = pos + (target - pos) * (1 - Math.exp(-dt / 45));
      el.scrollTop = Math.abs(target - next) < 0.5 ? target : next;
      // Stop once there, or if the page couldn't move (an edge, or something else is scrolling it).
      if (el.scrollTop !== target && Math.abs(el.scrollTop - pos) > 0.1) frame = requestAnimationFrame(step);
      else frame = 0;
    };
    const onWheel = (e: WheelEvent) => {
      if (!smoothOn() || e.ctrlKey || e.defaultPrevented || !isWheel(e) || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const px = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? innerHeight : 1);
      const to = scroller(e.target, px > 0);
      if (!to) return;
      e.preventDefault();
      // A new scroller, or one that moved since (scrollbar, keys, a drag): start from where it is now.
      if (to !== el || !frame) target = to.scrollTop;
      el = to;
      target = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, target + px));
      if (!frame) {
        last = performance.now();
        frame = requestAnimationFrame(step);
      }
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("wheel", onWheel);
    };
  }, []);
  return null;
}
