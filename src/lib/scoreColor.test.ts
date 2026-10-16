import { describe, expect, it } from "vitest";
import { scoreColor, scoreHue } from "./scoreColor";

describe("scoreHue", () => {
  it("runs from red to green", () => {
    expect(scoreHue(0)).toBe(22);
    expect(scoreHue(0.9)).toBe(150);
    expect(scoreHue(1)).toBe(195);
  });

  it("gives every point on a 10-point scale its own colour", () => {
    const hues = Array.from({ length: 11 }, (_, i) => scoreHue(i / 10));
    expect(new Set(hues).size).toBe(11);
    hues.slice(1).forEach((h, i) => expect(h).toBeGreaterThan(hues[i]));
  });

  it("clamps out-of-range values", () => {
    expect(scoreHue(-1)).toBe(22);
    expect(scoreHue(2)).toBe(195);
  });
});

it("scoreColor scales by the maximum", () => {
  expect(scoreColor(9, 10)).toBe(scoreColor(18, 20));
  expect(scoreColor(5, 0)).toBe(scoreColor(0, 10));
});
