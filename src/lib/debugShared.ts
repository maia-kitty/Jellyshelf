/** Debug options, stored in a cookie on the admin's own browser (so they only ever affect that browser). */
export const DEBUG_COOKIE = "jellyshelf_debug";
export const MAX_DEBUG_DELAY = 10_000;

export interface DebugOptions {
  /** Extra wait before every page renders, to see the route loading screen. */
  pageDelay: number;
  /** Extra wait before episode lists load, to see the in-page loader. */
  episodesDelay: number;
}

export const NO_DEBUG: DebugOptions = { pageDelay: 0, episodesDelay: 0 };

export function parseDebug(raw: string | undefined): DebugOptions {
  if (!raw) return NO_DEBUG;
  try {
    const v = JSON.parse(raw) as Partial<DebugOptions>;
    const clamp = (n: unknown) => (typeof n === "number" && n > 0 ? Math.min(n, MAX_DEBUG_DELAY) : 0);
    return { pageDelay: clamp(v.pageDelay), episodesDelay: clamp(v.episodesDelay) };
  } catch {
    return NO_DEBUG;
  }
}
