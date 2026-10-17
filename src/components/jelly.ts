/** The jelly highlight's move, shared by the tab rows and the dropdowns. */

export type Box = { x: number; y: number; w: number; h: number };

export const JELLY_MS = 750;
export const boxOf = (el: HTMLElement): Box => ({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
export const same = (a: Box, b: Box) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
const css = (b: Box) => ({ left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });

/** Put the blob on `to` without moving (first placement, or the layout shifted under it). */
export const place = (blob: HTMLElement, to: Box) => Object.assign(blob.style, css(to));

/**
 * Move the blob like jelly: it reaches out along the way it's going (thinning as it stretches), its tail snaps after
 * it, and it wobbles to rest. `at` starts it part-way through (carrying on a move another copy of the row began).
 */
export function jelly(blob: HTMLElement, from: Box, to: Box, { at = 0, duration = JELLY_MS } = {}) {
  blob.getAnimations().forEach((a) => a.cancel());
  place(blob, to);
  if (same(from, to) || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const across = Math.abs(from.y - to.y) < 4;
  const down = !across && Math.abs(from.x - to.x) < 4;
  const x = Math.min(from.x, to.x);
  const y = Math.min(from.y, to.y);
  // In a row it reaches sideways, in a list downwards; anywhere else (a tab wrapped onto the next line) it just glides.
  const reach = across
    ? { ...to, x, w: Math.max(from.x + from.w, to.x + to.w) - x }
    : down
      ? { ...to, y, h: Math.max(from.y + from.h, to.y + to.h) - y }
      : to;
  // Squash across the way it travels. The wobble is in scale, not position, so it's the same however far it went.
  const s = (along: number, side: number) => (down ? `scale(${side}, ${along})` : `scale(${along}, ${side})`);
  blob.animate(
    [
      { ...css(from), transform: "scale(1, 1)", easing: "cubic-bezier(0.5, 0, 0.9, 0.6)" },
      { ...css(reach), transform: s(1, 0.76), offset: 0.28, easing: "cubic-bezier(0.2, 0.9, 0.3, 1)" },
      { ...css(to), transform: s(1.05, 0.9), offset: 0.55, easing: "ease-in-out" },
      { ...css(to), transform: s(0.97, 1.06), offset: 0.75, easing: "ease-in-out" },
      { ...css(to), transform: s(1.01, 0.98), offset: 0.9, easing: "ease-in-out" },
      { ...css(to), transform: "scale(1, 1)" },
    ],
    { duration },
  ).currentTime = at;
}
