type CacheEntry = {
  data: unknown;
  at: number;
};

const store = new Map<string, CacheEntry>();
const SS_PREFIX = "wcp:";

const DEFAULT_FRESH_MS = 90_000;
const DEFAULT_MAX_AGE_MS = 300_000;

function canUseSessionStorage() {
  return typeof window !== "undefined" && typeof sessionStorage !== "undefined";
}

function readSessionEntry(key: string): CacheEntry | null {
  if (!canUseSessionStorage()) return null;
  try {
    const raw = sessionStorage.getItem(`${SS_PREFIX}${key}`);
    if (!raw) return null;
    return JSON.parse(raw) as CacheEntry;
  } catch {
    return null;
  }
}

function writeSessionEntry(key: string, entry: CacheEntry) {
  if (!canUseSessionStorage()) return;
  try {
    sessionStorage.setItem(`${SS_PREFIX}${key}`, JSON.stringify(entry));
  } catch {
    // تجاوز حصة التخزين — نكتفي بالذاكرة
  }
}

function removeSessionEntry(key: string) {
  if (!canUseSessionStorage()) return;
  try {
    sessionStorage.removeItem(`${SS_PREFIX}${key}`);
  } catch {
    // ignore
  }
}

export function readClientCache<T>(
  key: string,
  maxAgeMs = DEFAULT_MAX_AGE_MS
): T | null {
  const memory = store.get(key);
  if (memory && Date.now() - memory.at <= maxAgeMs) {
    return memory.data as T;
  }

  const session = readSessionEntry(key);
  if (!session) return null;
  if (Date.now() - session.at > maxAgeMs) {
    store.delete(key);
    removeSessionEntry(key);
    return null;
  }

  store.set(key, session);
  return session.data as T;
}

export function writeClientCache<T>(key: string, data: T): void {
  const entry: CacheEntry = { data, at: Date.now() };
  store.set(key, entry);
  writeSessionEntry(key, entry);
}

export function isClientCacheFresh(
  key: string,
  freshMs = DEFAULT_FRESH_MS
): boolean {
  const memory = store.get(key);
  if (memory && Date.now() - memory.at <= freshMs) return true;

  const session = readSessionEntry(key);
  if (!session || Date.now() - session.at > freshMs) return false;

  store.set(key, session);
  return true;
}
