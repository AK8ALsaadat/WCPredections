import {
  isClientCacheFresh,
  readClientCache,
  removeClientCache,
  writeClientCache,
} from "@/lib/client-page-cache";
import { clientFetch } from "@/lib/client-fetch";
import { enqueueBackgroundPrefetch } from "@/lib/prefetch-queue";

const DEFAULT_FRESH_MS = 60_000;
const LIVE_FRESH_MS = 10_000;
const FINISHED_FRESH_MS = 5 * 60_000;

type CachedLeaguePredictions = {
  match?: { status?: string };
};

type InflightPrefetch = {
  promise: Promise<void>;
  run: () => Promise<void>;
};

const inflight = new Map<string, InflightPrefetch>();

export function leaguePredictionsCacheKey(matchId: string) {
  return `league-predictions:v1:${matchId}`;
}

function freshMs(data?: CachedLeaguePredictions | null) {
  if (data?.match?.status === "LIVE") return LIVE_FRESH_MS;
  if (data?.match?.status === "FINISHED") return FINISHED_FRESH_MS;
  return DEFAULT_FRESH_MS;
}

export function readLeaguePredictionsCache<T>(matchId: string): T | null {
  return readClientCache<T>(leaguePredictionsCacheKey(matchId));
}

export function isLeaguePredictionsCacheFresh(matchId: string) {
  const cached = readLeaguePredictionsCache<CachedLeaguePredictions>(matchId);
  return isClientCacheFresh(
    leaguePredictionsCacheKey(matchId),
    freshMs(cached)
  );
}

export function writeLeaguePredictionsCache<T>(matchId: string, data: T) {
  writeClientCache(leaguePredictionsCacheKey(matchId), data);
}

async function fetchLeaguePredictions(matchId: string) {
  const response = await clientFetch(`/api/matches/${matchId}/predictions`);
  const data = response ? await response.json() : null;
  if (data?.success) {
    writeLeaguePredictionsCache(matchId, data.data);
  }
}

export function invalidateLeaguePredictionsCache(matchId: string) {
  removeClientCache(leaguePredictionsCacheKey(matchId));
  inflight.delete(matchId);
}

export function prefetchLeaguePredictions(
  matchId: string,
  options?: { urgent?: boolean }
) {
  if (isLeaguePredictionsCacheFresh(matchId)) return Promise.resolve();

  const existing = inflight.get(matchId);
  if (existing) {
    if (options?.urgent) void existing.run();
    return existing.promise;
  }

  let resolveTask: () => void;
  const task = new Promise<void>((resolve) => {
    resolveTask = resolve;
  });

  let started = false;
  const run = async () => {
    if (started) return task;
    started = true;
    try {
      await fetchLeaguePredictions(matchId);
    } finally {
      inflight.delete(matchId);
      resolveTask();
    }
  };

  inflight.set(matchId, { promise: task, run });
  if (options?.urgent) {
    void run();
  } else {
    enqueueBackgroundPrefetch(run, 2);
  }
  return task;
}
