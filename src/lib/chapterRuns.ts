/**
 * A manga's chapter list for display, newest first: each downloaded chapter on its own, and every run of chapters
 * that aren't downloaded yet as one line ("Ch. 87–137, 51 on their way") instead of a row each.
 */
export type ChapterRow<C> = { kind: "chapter"; chapter: C } | { kind: "missing"; first: number; last: number; count: number };

export function chapterRuns<C extends { number: number; onDisk: boolean }>(chapters: C[]): ChapterRow<C>[] {
  const rows: ChapterRow<C>[] = [];
  for (const c of [...chapters].sort((a, b) => b.number - a.number)) {
    const prev = rows[rows.length - 1];
    if (c.onDisk) rows.push({ kind: "chapter", chapter: c });
    else if (prev?.kind === "missing") {
      prev.first = c.number;
      prev.count++;
    } else rows.push({ kind: "missing", first: c.number, last: c.number, count: 1 });
  }
  return rows;
}
