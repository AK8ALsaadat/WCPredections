type CacheEntry = {
  data: unknown;
  at: number;
};

const store = new Map<string, CacheEntry>();

const DEFAULT_FRESH_MS = 90_000;
const DEFAULT_MAX_AGE_MS = 300_000;

export function readClientCache<T>(
  key: string,
  maxAgeMs = DEFAULT_MAX_AGE_MS
): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > maxAgeMs) {
    store.delete(key);
    return null;
  }
  return entry.data as T;
}

export function writeClientCache<T>(key: string, data: T): void {
  store.set(key, { data, at: Date.now() });
}

export function isClientCacheFresh(
  key: string,
  freshMs = DEFAULT_FRESH_MS
): boolean {
  const entry = store.get(key);
  return entry != null && Date.now() - entry.at <= freshMs;
}
