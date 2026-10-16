interface Entry<T> {
  value: Promise<T>;
  expires: number;
  /** Past `expires` but before this, the old value is still served while a fresh one is fetched. */
  staleUntil: number;
  refreshing?: boolean;
}

const g = globalThis as unknown as { __jellyshelfCache?: Map<string, Entry<unknown>> };
const store = (g.__jellyshelfCache ??= new Map());
const MAX_ENTRIES = 2000;

/**
 * Memoize an async call for `ttlSeconds`. Concurrent callers share one in-flight promise; failures are not cached.
 *
 * With `staleSeconds`, an expired value keeps being served for that much longer while a fresh one is fetched in the
 * background, so a page you've seen before never waits on the upstream (if the refresh fails, the old value stays).
 */
export function cached<T>(key: string, ttlSeconds: number, fn: () => Promise<T>, staleSeconds = 0): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expires > now) return hit.value;
  if (hit && hit.staleUntil > now) {
    if (!hit.refreshing) {
      hit.refreshing = true;
      const next = fn();
      next.then(
        // Unless invalidate() dropped it meanwhile: then this answer may predate the change that caused that.
        () => store.get(key) === hit && store.set(key, entry(next, ttlSeconds, staleSeconds)),
        () => (hit.refreshing = false),
      );
    }
    return hit.value;
  }
  if (store.size >= MAX_ENTRIES) {
    for (const [k, e] of store) if (e.staleUntil <= now) store.delete(k);
    if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value!);
  }
  const value = fn();
  store.set(key, entry(value, ttlSeconds, staleSeconds));
  value.catch(() => store.delete(key));
  return value;
}

function entry<T>(value: Promise<T>, ttlSeconds: number, staleSeconds: number): Entry<T> {
  const expires = Date.now() + ttlSeconds * 1000;
  return { value, expires, staleUntil: expires + staleSeconds * 1000 };
}

export function invalidate(prefix: string) {
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}
