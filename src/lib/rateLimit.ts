/**
 * Fixed-window attempt counter, in memory. One container serves the app, so that's enough; a restart resets it.
 * shortcut: per-process only, move to the DB if Jellyshelf ever runs as several instances.
 */
const windows = new Map<string, { count: number; resetAt: number }>();

/** Count an attempt against `key`; returns the ms until the window resets if it's over `max`, else 0. */
export function hit(key: string, max: number, windowMs: number, now = Date.now()): number {
  if (windows.size > 10_000) for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
  let w = windows.get(key);
  if (!w || w.resetAt <= now) windows.set(key, (w = { count: 0, resetAt: now + windowMs }));
  w.count++;
  return w.count > max ? w.resetAt - now : 0;
}

export const forgive = (key: string) => windows.delete(key);
