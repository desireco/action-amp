const globalStore = (globalThis as any).__APP_CACHE__ || { store: new Map<string, any>() };
(globalThis as any).__APP_CACHE__ = globalStore;

type CacheEntry<T> = {
  value?: T;
  expiresAt?: number;
  inFlight?: Promise<T>;
};

export function getCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: { ttlMs: number; staleWhileRevalidate?: boolean }
): Promise<T> {
  const now = Date.now();
  let entry: CacheEntry<T> = globalStore.store.get(key);
  if (!entry) {
    entry = {} as CacheEntry<T>;
    globalStore.store.set(key, entry);
  }

  if (entry.value !== undefined && entry.expiresAt && entry.expiresAt > now) {
    return Promise.resolve(entry.value as T);
  }

  if (entry.inFlight) {
    if (entry.value !== undefined && (opts.staleWhileRevalidate ?? true)) {
      return Promise.resolve(entry.value as T);
    }
    return entry.inFlight;
  }

  const p = fetcher().then((val) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[cache miss] ${key}`);
    }
    entry.value = val;
    entry.expiresAt = Date.now() + opts.ttlMs;
    entry.inFlight = undefined;
    return val;
  }).catch((err) => {
    entry.inFlight = undefined;
    throw err;
  });

  entry.inFlight = p;
  if (entry.value !== undefined && (opts.staleWhileRevalidate ?? true)) {
    return Promise.resolve(entry.value as T);
  }
  return p;
}

export function invalidate(...keys: string[]) {
  for (const key of keys) {
    const entry = globalStore.store.get(key);
    if (entry) {
      globalStore.store.delete(key);
    }
  }
}

export function invalidateByPrefix(prefix: string) {
  for (const key of globalStore.store.keys()) {
    if (key.startsWith(prefix)) {
      globalStore.store.delete(key);
    }
  }
}

export function setCached<T>(key: string, value: T, ttlMs: number) {
  const entry: CacheEntry<T> = {
    value,
    expiresAt: Date.now() + ttlMs,
  };
  globalStore.store.set(key, entry);
}
