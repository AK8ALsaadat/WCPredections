import {
  invalidateClientCachePrefix,
  isClientCacheFresh,
  readClientCache,
  removeClientCache,
  writeClientCache,
} from "@/lib/client-page-cache";
import { isWithinLineupFastRefreshWindow } from "@/lib/utils";
import { enqueueBackgroundPrefetch } from "@/lib/prefetch-queue";

const MATCH_FRESH_MS = 300_000;
const LINEUP_FRESH_MS = 600_000;
const LINEUP_PROBABLE_FRESH_MS = 45_000;
const PREDICT_DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type LineupCacheMeta = {
  lineupStatus?: "official" | "probable" | "estimated";
};

function lineupFreshMs(
  lineup?: LineupCacheMeta | null,
  matchTime?: string | Date | null
) {
  if (!matchTime || !isWithinLineupFastRefreshWindow(matchTime)) {
    return LINEUP_FRESH_MS;
  }
  return lineup?.lineupStatus === "official"
    ? LINEUP_FRESH_MS
    : LINEUP_PROBABLE_FRESH_MS;
}

type InflightPrefetch = {
  promise: Promise<void>;
  run: () => Promise<void>;
};

const inflight = new Map<string, InflightPrefetch>();

// Use prioritized background prefetching to avoid blocking the main thread
// or launching many simultaneous network requests.
// Set to `true` to disable prefetching entirely.
const DISABLE_PREFETCH = false;

export function predictMatchCacheKey(matchId: string) {
  return `predict:match:${matchId}`;
}

export function predictLineupCacheKey(matchId: string) {
  return `predict:lineup:v10:${matchId}`;
}

function predictDraftCacheKey(matchId: string) {
  return `predict:draft:v1:${matchId}`;
}

type ListMatchSeed = {
  id: string;
  matchTime: string | Date;
  isKnockout: boolean;
  homeTeam: {
    id: string;
    name: string;
    shortName: string;
    logoUrl?: string | null;
  };
  awayTeam: {
    id: string;
    name: string;
    shortName: string;
    logoUrl?: string | null;
  };
  userPrediction?: {
    predHome: number;
    predAway: number;
    isDouble: boolean;
    predictedFinishType?: string | null;
    predictedPenaltyWinnerTeamId?: string | null;
  } | null;
  userScorerPredictions?: { playerId: string; predictedGoals: number }[];
  userBoldScorerBet?: {
    playerId?: string;
    points: number;
    player: { name: string };
  } | null;
};

async function fetchPredictMatch(matchId: string) {
  const res = await fetch(`/api/matches/${matchId}?predict=true`, {
    credentials: "same-origin",
  });
  if (!res.ok) return;
  const data = await res.json();
  if (data.success) {
    writeClientCache(predictMatchCacheKey(matchId), {
      ...data.data,
      _complete: true,
    });
  }
}

async function fetchPredictLineup(matchId: string) {
  const res = await fetch(`/api/matches/${matchId}/lineup`, {
    credentials: "same-origin",
  });
  if (!res.ok) return;
  const data = await res.json();
  if (data.success) {
    writeClientCache(predictLineupCacheKey(matchId), data.data);
  }
}

type PredictMatchCache = {
  _complete?: boolean;
};

/** يزرع كاش سريع من بيانات بطاقة المباراة قبل فتح صفحة التوقع */
export function seedPredictMatchFromList(match: ListMatchSeed) {
  if (DISABLE_PREFETCH) return;
  const existing = readClientCache<Record<string, unknown>>(
    predictMatchCacheKey(match.id)
  );
  if (existing?._complete) return;

  const matchTime =
    typeof match.matchTime === "string"
      ? match.matchTime
      : match.matchTime.toISOString();

  const seeded = {
    ...(existing ?? {}),
    id: match.id,
    matchTime,
    isKnockout: match.isKnockout,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    userPrediction: match.userPrediction
      ? {
          predHome: match.userPrediction.predHome,
          predAway: match.userPrediction.predAway,
          isDouble: match.userPrediction.isDouble,
          predictedFinishType:
            match.userPrediction.predictedFinishType ?? null,
          predictedPenaltyWinnerTeamId:
            match.userPrediction.predictedPenaltyWinnerTeamId ?? null,
        }
      : null,
    userScorerPredictions:
      match.userScorerPredictions?.map((sp) => ({
        playerId: sp.playerId,
        predictedGoals: sp.predictedGoals ?? 1,
      })) ?? [],
    userBoldScorerBet: match.userBoldScorerBet?.playerId
      ? {
          playerId: match.userBoldScorerBet.playerId,
          points: match.userBoldScorerBet.points,
          player: { name: match.userBoldScorerBet.player.name },
        }
      : null,
  };

  writeClientCache(predictMatchCacheKey(match.id), seeded);
}

/** يحمّل بيانات التوقع مسبقاً — فور ظهور الرابط أو لمسه */
export function prefetchPredictData(
  matchId: string,
  options?: { urgent?: boolean; includeLineup?: boolean }
) {
  if (DISABLE_PREFETCH) return Promise.resolve();
  const includeLineup = options?.includeLineup === true;
  const matchFresh = isClientCacheFresh(
    predictMatchCacheKey(matchId),
    MATCH_FRESH_MS
  );
  const cachedLineup = readClientCache<LineupCacheMeta>(
    predictLineupCacheKey(matchId)
  );
  const matchCached = readClientCache<{ matchTime?: string }>(
    predictMatchCacheKey(matchId)
  );
  const lineupFresh = isClientCacheFresh(
    predictLineupCacheKey(matchId),
    lineupFreshMs(cachedLineup, matchCached?.matchTime)
  );
  if (matchFresh && (!includeLineup || lineupFresh)) return Promise.resolve();

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
      await Promise.all([
        matchFresh ? Promise.resolve() : fetchPredictMatch(matchId),
        includeLineup && !lineupFresh
          ? fetchPredictLineup(matchId)
          : Promise.resolve(),
      ]);
    } finally {
      inflight.delete(matchId);
      resolveTask();
    }
  };

  inflight.set(matchId, { promise: task, run });
  if (options?.urgent) {
    void run();
  } else {
    enqueueBackgroundPrefetch(run, 3);
  }
  return task;
}

export function readPredictMatchCache<T>(matchId: string): T | null {
  return readClientCache<T>(predictMatchCacheKey(matchId));
}

export function readPredictLineupCache<T>(matchId: string): T | null {
  return readClientCache<T>(predictLineupCacheKey(matchId));
}

export function writePredictMatchCache<T>(matchId: string, data: T) {
  writeClientCache(predictMatchCacheKey(matchId), data);
}

export function writePredictLineupCache<T>(matchId: string, data: T) {
  writeClientCache(predictLineupCacheKey(matchId), data);
}

export function readPredictDraft<T>(matchId: string): T | null {
  return readClientCache<T>(
    predictDraftCacheKey(matchId),
    PREDICT_DRAFT_MAX_AGE_MS
  );
}

export function writePredictDraft<T>(matchId: string, data: T) {
  writeClientCache(predictDraftCacheKey(matchId), data);
}

export function clearPredictDraft(matchId: string) {
  removeClientCache(predictDraftCacheKey(matchId));
}

export function isPredictMatchCacheFresh(matchId: string) {
  const cached = readPredictMatchCache<PredictMatchCache>(matchId);
  return (
    cached?._complete === true &&
    isClientCacheFresh(predictMatchCacheKey(matchId), MATCH_FRESH_MS)
  );
}

export function isPredictLineupCacheFresh(matchId: string) {
  const cached = readPredictLineupCache<LineupCacheMeta>(matchId);
  const matchCached = readPredictMatchCache<{ matchTime?: string }>(matchId);
  return isClientCacheFresh(
    predictLineupCacheKey(matchId),
    lineupFreshMs(cached, matchCached?.matchTime)
  );
}

export function hasPredictMatchCache(matchId: string) {
  return readPredictMatchCache(matchId) != null;
}

/** بعد حفظ التوقع — امسح الكاش حتى ما يظهر بيانات قديمة */
export function invalidatePredictCaches(matchId: string) {
  removeClientCache(predictMatchCacheKey(matchId));
  removeClientCache(predictLineupCacheKey(matchId));
  inflight.delete(matchId);
}

/** امسح كاش صفحة المباريات بعد تعديل توقع */
export function invalidateMatchesListCaches() {
  invalidateClientCachePrefix("matches:");
}
