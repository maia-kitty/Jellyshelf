import type { RatingRow } from "./ratings";

/** "date" | "score" | "title" | a rubric category name */
export type RatingSortKey = string;

export interface RatingSort {
  key: RatingSortKey;
  /** 1 = natural order (highest / newest / A–Z first), -1 = reversed */
  dir: 1 | -1;
}

type Sortable = Pick<RatingRow, "title" | "date" | "anilistScore" | "rubric">;

export const scoreOf = (r: Sortable) => r.anilistScore ?? r.rubric?.total ?? 0;

/** Sorts in place. Rows without a rubric breakdown go last when sorting by a category, in either direction. */
export function sortRatings<T extends Sortable>(rows: T[], { key, dir }: RatingSort, categories: { name: string }[]): T[] {
  const isCategory = categories.some((c) => c.name === key);
  return rows.sort((a, b) => {
    if (isCategory) {
      const av = a.rubric?.scores[key];
      const bv = b.rubric?.scores[key];
      if (av === undefined || bv === undefined) return av === bv ? 0 : av === undefined ? 1 : -1;
      // Ties (common: categories are small integers) fall back to the overall score.
      return dir * (bv - av) || scoreOf(b) - scoreOf(a);
    }
    if (key === "score") return dir * (scoreOf(b) - scoreOf(a));
    if (key === "title") return dir * a.title.localeCompare(b.title);
    return dir * (b.date ?? "").localeCompare(a.date ?? "");
  });
}
