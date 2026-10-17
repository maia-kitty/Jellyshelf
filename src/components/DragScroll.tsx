"use client";

import { useEffect } from "react";

/** Off when the account menu's "Drag to scroll with the mouse" is unticked (per browser). */
export const DRAG_KEY = "dragScroll";
export const dragOn = () => {
  try {
    return localStorage.getItem(DRAG_KEY) !== "0";
  } catch {
    return true;
  }
};

/** What a press scrolls: a card row sideways, or a list (.bounce-y) up and down in whatever it scrolls in. */
function grabbed(t: Element): { el: HTMLElement; across: boolean } | null {
  if (t.closest("input, textarea, select, [contenteditable]")) return null;
  // Not the tab rows (<nav>): they're for clicking.
  const row = t.closest(".scroll-row:not(nav)");
  if (row instanceof HTMLElement) return row.scrollWidth > row.clientWidth ? { el: row, across: true } : null;
  if (!t.closest(".bounce-y")) return null;
  for (let el = t.parentElement; el; el = el.parentElement) {
    const y = getComputedStyle(el).overflowY;
    if ((y === "auto" || y === "scroll") && el.scrollHeight > el.clientHeight) return { el, across: false };
  }
  const page = document.scrollingElement;
  return page instanceof HTMLElement ? { el: page, across: false } : null;
}

/**
 * Card rows and lists can be grabbed and dragged with a mouse (rows sideways, lists up and down), and glide on when let
 * go, like a swipe. A click that didn't move still opens the card; one that dragged doesn't. Touch and pens scroll
 * natively.
 */
export function DragScroll() {
  useEffect(() => {
    let glide = 0;
    let dragged = false;

    const onDown = (e: PointerEvent) => {
      dragged = false;
      if (e.pointerType !== "mouse" || e.button !== 0 || !dragOn()) return;
      const g = e.target instanceof Element ? grabbed(e.target) : null;
      if (!g) return;
      const { el, across } = g;
      const at = (p: PointerEvent) => (across ? p.clientX : p.clientY);
      const pos = () => (across ? el.scrollLeft : el.scrollTop);
      const to = (v: number) => (across ? (el.scrollLeft = v) : (el.scrollTop = v));
      cancelAnimationFrame(glide);
      const x0 = at(e);
      const left0 = pos();
      let moving = false;
      let last = { x: x0, t: e.timeStamp };
      let v = 0; // px per ms, smoothed

      // No text selection or native image/link dragging while it's held.
      const block = (ev: Event) => ev.preventDefault();
      const onMove = (m: PointerEvent) => {
        if (!moving && Math.abs(at(m) - x0) < 5) return;
        if (!moving) {
          moving = true;
          document.documentElement.style.cursor = "grabbing";
        }
        to(left0 - (at(m) - x0));
        const dt = m.timeStamp - last.t;
        if (dt > 0) v = v * 0.4 + ((at(m) - last.x) / dt) * 0.6;
        last = { x: at(m), t: m.timeStamp };
      };
      const onUp = (u: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        window.removeEventListener("dragstart", block);
        window.removeEventListener("selectstart", block);
        if (!moving) return;
        document.documentElement.style.cursor = "";
        // Swallow the click this release makes (see onClick); if there isn't one, don't eat the next real click.
        dragged = true;
        setTimeout(() => (dragged = false));
        // Held still before letting go: no glide.
        if (u.timeStamp - last.t > 80) v = 0;
        let t = performance.now();
        const step = (now: number) => {
          const dt = now - t;
          t = now;
          const before = pos();
          to(before - v * dt);
          v *= Math.exp(-dt / 325);
          if (Math.abs(v) > 0.02 && pos() !== before) glide = requestAnimationFrame(step);
        };
        glide = requestAnimationFrame(step);
      };
      // On the window, so the drag carries on (and ends) wherever the mouse goes.
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
      window.addEventListener("dragstart", block);
      window.addEventListener("selectstart", block);
    };
    // The click that ends a drag lands on whatever card is under the mouse; it isn't a click on that card.
    const onClick = (e: MouseEvent) => {
      if (!dragged) return;
      dragged = false;
      e.preventDefault();
      e.stopPropagation();
    };
    const onWheel = () => cancelAnimationFrame(glide);

    document.addEventListener("pointerdown", onDown);
    window.addEventListener("click", onClick, true);
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      cancelAnimationFrame(glide);
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("wheel", onWheel);
    };
  }, []);
  return null;
}
