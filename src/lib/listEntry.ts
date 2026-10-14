import type { AniListEntry, AniListStatus, FuzzyDate, ListEntryPatch } from "./clients/anilist";

export type ListChange =
  | { kind: "progress"; value: number }
  | { kind: "status"; value: AniListStatus }
  | { kind: "score"; value: number };

export function fuzzyToday(d = new Date()): FuzzyDate {
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

const empty = (d?: FuzzyDate | null) => !d?.year;

/**
 * Turn a UI action into an AniList update, following the same conventions as the AniList site:
 * watching an episode of something you're not watching starts it, finishing the last episode completes it,
 * and start/finish dates are filled in the first time.
 */
export function listPatch(
  current: Pick<AniListEntry, "status" | "progress" | "repeat" | "startedAt" | "completedAt"> | undefined,
  episodes: number | null,
  change: ListChange,
  today: FuzzyDate = fuzzyToday(),
): ListEntryPatch {
  const patch: ListEntryPatch = {};
  const status = current?.status;
  const start = () => {
    if (empty(current?.startedAt)) patch.startedAt = today;
  };
  const complete = () => {
    patch.status = "COMPLETED";
    if (episodes) patch.progress = episodes;
    if (empty(current?.completedAt)) patch.completedAt = today;
    start();
    if (status === "REPEATING") patch.repeat = (current?.repeat ?? 0) + 1;
  };

  switch (change.kind) {
    case "score":
      patch.scoreRaw = Math.round(Math.min(100, Math.max(0, change.value)));
      if (!current) patch.status = "COMPLETED";
      return patch;

    case "status":
      if (change.value === "COMPLETED") {
        complete();
        // Repeat count only goes up when you finish a rewatch, not when you just mark something completed.
        if (status !== "REPEATING") delete patch.repeat;
      } else {
        patch.status = change.value;
        if (change.value === "CURRENT") start();
        if (change.value === "REPEATING") patch.progress = 0;
      }
      return patch;

    case "progress": {
      const p = Math.max(0, episodes ? Math.min(change.value, episodes) : change.value);
      patch.progress = p;
      if (episodes && p >= episodes && status !== "COMPLETED") {
        complete();
      } else if (p > 0 && (!status || status === "PLANNING" || status === "PAUSED" || status === "DROPPED")) {
        patch.status = "CURRENT";
        start();
      } else if (!status) {
        patch.status = "PLANNING";
      }
      return patch;
    }
  }
}
