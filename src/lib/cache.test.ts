import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cached, invalidate } from "./cache";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  invalidate("t:");
  vi.useRealTimers();
});

it("serves the old value past expiry while it refreshes, then the new one", async () => {
  let release!: (v: number) => void;
  const fn = vi.fn().mockResolvedValueOnce(1).mockReturnValueOnce(new Promise((r) => (release = r)));
  expect(await cached("t:a", 10, fn, 60)).toBe(1);
  vi.advanceTimersByTime(11_000);
  expect(await cached("t:a", 10, fn, 60)).toBe(1); // stale, no waiting
  expect(await cached("t:a", 10, fn, 60)).toBe(1); // one refresh in flight, not two
  expect(fn).toHaveBeenCalledTimes(2);
  release(2);
  await Promise.resolve();
  expect(await cached("t:a", 10, fn, 60)).toBe(2);
});

it("keeps the old value when the refresh fails", async () => {
  const fn = vi.fn().mockResolvedValueOnce("ok").mockRejectedValueOnce(new Error("429")).mockResolvedValueOnce("new");
  expect(await cached("t:b", 10, fn, 60)).toBe("ok");
  vi.advanceTimersByTime(11_000);
  expect(await cached("t:b", 10, fn, 60)).toBe("ok");
  await Promise.resolve();
  expect(await cached("t:b", 10, fn, 60)).toBe("ok"); // failed refresh dropped; this one starts another
  expect(fn).toHaveBeenCalledTimes(3);
});

it("without a stale window, waits for a fresh value", async () => {
  const fn = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
  await cached("t:c", 10, fn);
  vi.advanceTimersByTime(11_000);
  expect(await cached("t:c", 10, fn)).toBe(2);
});

it("doesn't let a refresh from before invalidate() overwrite what came after", async () => {
  let release!: (v: string) => void;
  const fn = vi.fn().mockResolvedValueOnce("old").mockReturnValueOnce(new Promise((r) => (release = r))).mockResolvedValueOnce("after");
  await cached("t:d", 10, fn, 60);
  vi.advanceTimersByTime(11_000);
  await cached("t:d", 10, fn, 60); // refresh starts
  invalidate("t:d");
  expect(await cached("t:d", 10, fn, 60)).toBe("after");
  release("before");
  await Promise.resolve();
  expect(await cached("t:d", 10, fn, 60)).toBe("after");
});
