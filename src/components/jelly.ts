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
  const running = blob.getAnimations();
  // Caught mid-move (the pointer sweeping down a list): its squash, read before it's cancelled, to carry on from.
  const squash = running.length && !at ? getComputedStyle(blob).transform : null;
  running.forEach((a) => a.cancel());
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
  // A list's highlight already fills its width, so it never bulges sideways there: the list would clip it.
  const s = (along: number, side: number) => (down ? `scale(${Math.min(side, 1)}, ${along})` : `scale(${along}, ${side})`);
  if (squash) {
    // Starting over would stretch it again from wherever it got to, so a quick sweep leaves it a shaking smear that
    // only lands once the pointer stops. Instead it heads straight for the new spot and only wobbles when it gets there.
    blob.animate(
      [
        { ...css(from), transform: squash === "none" ? "scale(1, 1)" : squash, easing: "cubic-bezier(0.2, 0.9, 0.3, 1)" },
        { ...css(to), transform: s(1.03, 0.94), offset: 0.45, easing: "ease-in-out" },
        { ...css(to), transform: s(0.99, 1.02), offset: 0.7, easing: "ease-in-out" },
        { ...css(to), transform: "scale(1, 1)" },
      ],
      { duration },
    );
    return;
  }
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
