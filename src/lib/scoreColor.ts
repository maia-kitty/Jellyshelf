/**
 * A colour for a score, on a smooth red → amber → yellow → green scale, so 7/10 and 8/10 (or 74 and 81) look
 * different instead of falling into the same bucket. OKLCH keeps the brightness even across hues, so no step of the
 * scale is harder to read on the dark background than another.
 */

// [share of the maximum, hue]. Most real ratings sit in the top third, so that's where the hue moves fastest, running
// on past green into teal and cyan for the near-perfect ones.
const STOPS: [number, number][] = [
  [0, 22], // red
  [0.4, 40], // orange
  [0.6, 70], // amber
  [0.7, 90], // yellow
  [0.8, 120], // lime
  [0.9, 150], // green
  [1, 195], // cyan
];

/** Hue (OKLCH degrees) for `ratio` in 0–1. */
export function scoreHue(ratio: number): number {
  const r = Math.min(1, Math.max(0, ratio));
  for (let i = 1; i < STOPS.length; i++) {
    const [r1, h1] = STOPS[i];
    if (r <= r1) {
      const [r0, h0] = STOPS[i - 1];
      return h0 + ((r - r0) / (r1 - r0)) * (h1 - h0);
    }
  }
  return STOPS[STOPS.length - 1][1];
}

/** CSS colour for `value` out of `max`. */
export function scoreColor(value: number, max: number): string {
  return `oklch(0.8 0.15 ${scoreHue(max > 0 ? value / max : 0).toFixed(1)})`;
}
