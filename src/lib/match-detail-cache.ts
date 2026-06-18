import {
  isClientCacheFresh,
  readClientCache,
  removeClientCache,
  writeClientCache,
} from "@/lib/client-page-cache";
import { clientFetch } from "@/lib/client-fetch";
import { enqueueBackgroundPrefetch } from "@/lib/prefetch-queue";

const MATCH_DETAIL_FRESH_MS = 120_000;
const MATCH_DETAIL_MAX_AGE_MS = 10 * 60_000;

const inflight = new Map<string, Promise<void>>();

export function matchDetailCacheKey(matchId: string) {
  return `match-detail:v1:${matchId}`;
}

export function readMatchDetailCache<T>(matchId: string): T | null {
  return readClientCache<T>(
    matchDetailCacheKey(matchId),
    MATCH_DETAIL_MAX_AGE_MS
  );
}

export function writeMatchDetailCache<T>(matchId: string, data: T) {
  writeClientCache(matchDetailCacheKey(matchId), data);
}

export function isMatchDetailCacheFresh(matchId: string) {
  return isClientCacheFresh(matchDetailCacheKey(matchId), MATCH_DETAIL_FRESH_MS);
}

export function invalidateMatchDetailCache(matchId: string) {
  removeClientCache(matchDetailCacheKey(matchId));
}

export function prefetchMatchDetail(matchId: string, urgent = false) {
  if (
    isMatchDetailCacheFresh(matchId) &&
    readMatchDetailCache<unknown>(matchId) != null
  ) {
    return Promise.resolve();
  }

  const existing = inflight.get(matchId);
  if (existing) return existing;

  const run = async () => {
    try {
      const res = await clientFetch(`/api/matches/${matchId}`);
      if (!res?.ok) return;
      const data = await res.json();
      if (data?.success) writeMatchDetailCache(matchId, data.data);
    } finally {
      inflight.delete(matchId);
    }
  };

  const task = urgent
    ? run()
    : new Promise<void>((resolve) => {
        enqueueBackgroundPrefetch(async () => {
          await run();
          resolve();
        }, 4);
      });

  inflight.set(matchId, task);
  return task;
}
