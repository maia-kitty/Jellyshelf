interface Entry<T> {
  value: Promise<T>;
  expires: number;
}

const g = globalThis as unknown as { __kitsuneCache?: Map<string, Entry<unknown>> };
const store = (g.__kitsuneCache ??= new Map());
const MAX_ENTRIES = 2000;

/** Memoize an async call for `ttlSeconds`. Concurrent callers share one in-flight promise; failures are not cached. */
export function cached<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expires > now) return hit.value;
  if (store.size >= MAX_ENTRIES) {
    for (const [k, e] of store) if (e.expires <= now) store.delete(k);
    if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value!);
  }
  const value = fn();
  store.set(key, { value, expires: now + ttlSeconds * 1000 });
  value.catch(() => store.delete(key));
  return value;
}

export function invalidate(prefix: string) {
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}
