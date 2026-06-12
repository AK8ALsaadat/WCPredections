/**
 * ذاكرة تخزين مؤقت للعميل (Client-side Cache)
 * تقلل من عدد API calls عند التنقل بين الصفحات
 */

type CacheEntry<T> = {
  data: T;
  timestamp: number;
  expiresIn?: number; // بالملي ثانية
};

const cache = new Map<string, CacheEntry<unknown>>();

/**
 * احصل على بيانات من الكاش إذا كانت لا تزال صالحة
 */
export function getFromCache<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;

  const now = Date.now();
  if (entry.expiresIn && now - entry.timestamp > entry.expiresIn) {
    cache.delete(key);
    return null;
  }

  return entry.data;
}

/**
 * احفظ بيانات في الكاش
 */
export function setCache<T>(
  key: string,
  data: T,
  expiresInMs: number = 5 * 60 * 1000 // 5 دقائق افتراضياً
): void {
  cache.set(key, {
    data,
    timestamp: Date.now(),
    expiresIn: expiresInMs,
  });
}

/**
 * امسح الكاش
 */
export function clearCache(pattern?: string): void {
  if (!pattern) {
    cache.clear();
    return;
  }
  
  for (const key of cache.keys()) {
    if (key.includes(pattern)) {
      cache.delete(key);
    }
  }
}

/**
 * مفاتيح الكاش القياسية
 */
export const cacheKeys = {
  match: (id: string) => `match:${id}`,
  predictions: (matchId: string) => `predictions:${matchId}`,
  leaderboard: (roundId?: string) => `leaderboard:${roundId || "overall"}`,
  lineup: (matchId: string) => `lineup:${matchId}`,
  user: "user:current",
};
