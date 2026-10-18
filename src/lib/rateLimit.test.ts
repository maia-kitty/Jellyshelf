import { expect, it } from "vitest";
import { forgive, hit } from "./rateLimit";

it("blocks past the limit until the window resets", () => {
  for (let i = 0; i < 3; i++) expect(hit("t:a", 3, 1000, 0)).toBe(0);
  expect(hit("t:a", 3, 1000, 400)).toBe(600);
  expect(hit("t:a", 3, 1000, 1000)).toBe(0); // new window
});

it("forgive clears a key", () => {
  hit("t:b", 1, 1000, 0);
  expect(hit("t:b", 1, 1000, 0)).toBeGreaterThan(0);
  forgive("t:b");
  expect(hit("t:b", 1, 1000, 0)).toBe(0);
});
