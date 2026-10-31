/**
 * A manga's chapter list for display, newest first: each downloaded chapter on its own, and every run of chapters
 * that aren't downloaded yet as one line ("Ch. 87–137, 51 on their way") instead of a row each. Runs of chapters that
 * were never asked for (`wanted: false`) are separate lines from the ones on their way.
 */
export type ChapterRow<C> = { kind: "chapter"; chapter: C } | { kind: "missing"; first: number; last: number; count: number; requested: boolean };

export function chapterRuns<C extends { number: number; onDisk: boolean; wanted?: boolean }>(chapters: C[]): ChapterRow<C>[] {
  const rows: ChapterRow<C>[] = [];
  for (const c of [...chapters].sort((a, b) => b.number - a.number)) {
    const prev = rows[rows.length - 1];
    const requested = c.wanted !== false;
    if (c.onDisk) rows.push({ kind: "chapter", chapter: c });
    else if (prev?.kind === "missing" && prev.requested === requested) {
      prev.first = c.number;
      prev.count++;
    } else rows.push({ kind: "missing", first: c.number, last: c.number, count: 1, requested });
  }
  return rows;
}
