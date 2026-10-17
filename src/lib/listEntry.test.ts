import { describe, expect, it } from "vitest";
import { fuzzyToday, listPatch } from "./listEntry";

const today = { year: 2026, month: 10, day: 14 };
const none = { year: null, month: null, day: null };
const entry = (status: "CURRENT" | "PLANNING" | "COMPLETED" | "REPEATING", progress = 0) => ({
  status,
  progress,
  repeat: 0,
  startedAt: none,
  completedAt: none,
});

describe("listPatch", () => {
  it("watching ep 1 of a planned show starts it", () => {
    expect(listPatch(entry("PLANNING"), 12, { kind: "progress", value: 1 }, today)).toEqual({
      progress: 1,
      status: "CURRENT",
      startedAt: today,
    });
  });
  it("watching the last episode completes it", () => {
    expect(listPatch(entry("CURRENT", 11), 12, { kind: "progress", value: 12 }, today)).toEqual({
      progress: 12,
      status: "COMPLETED",
      completedAt: today,
      startedAt: today,
    });
  });
  it("finishing a rewatch bumps the repeat count", () => {
    expect(listPatch(entry("REPEATING", 11), 12, { kind: "progress", value: 12 }, today)).toMatchObject({ status: "COMPLETED", repeat: 1 });
  });
  it("progress is clamped to the episode count", () => {
    expect(listPatch(entry("CURRENT", 3), 12, { kind: "progress", value: 40 }, today).progress).toBe(12);
  });
  it("marking completed fills progress", () => {
    expect(listPatch(entry("CURRENT", 3), 24, { kind: "status", value: "COMPLETED" }, today)).toMatchObject({
      status: "COMPLETED",
      progress: 24,
    });
  });
  it("progress on an airing show (unknown length) never auto-completes", () => {
    expect(listPatch(entry("CURRENT", 30), null, { kind: "progress", value: 31 }, today)).toEqual({ progress: 31 });
  });
  it("rating something not on the list adds it as completed", () => {
    expect(listPatch(undefined, 12, { kind: "score", value: 96 }, today)).toEqual({ scoreRaw: 96, status: "COMPLETED" });
  });
});

describe("fuzzyToday", () => {
  const halfPastMidnightInPrague = new Date("2026-10-17T22:30:00Z");
  it("dates by the viewer's time zone, not the server's", () => {
    expect(fuzzyToday(halfPastMidnightInPrague, "Europe/Prague")).toEqual({ year: 2026, month: 10, day: 18 });
    expect(fuzzyToday(halfPastMidnightInPrague, "America/Los_Angeles")).toEqual({ year: 2026, month: 10, day: 17 });
  });
  it("falls back to the server's zone for a zone it doesn't know", () => {
    const d = halfPastMidnightInPrague;
    expect(fuzzyToday(d, "Mars/Olympus_Mons")).toEqual({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() });
  });
});
