import type { MatchStatus } from "@prisma/client";

export type PredictionMatchMeta = {
  id: string;
  roundId: string;
  homeTeamId: string;
  awayTeamId: string;
  matchTime: Date;
  status: MatchStatus;
  isKnockout: boolean;
  homeTeam: { shortName: string };
  awayTeam: { shortName: string };
};

const PREDICTION_MATCH_META_TTL_MS = 5 * 60 * 1000;

const cache = new Map<
  string,
  { data: PredictionMatchMeta; expiresAt: number }
>();

export function getPredictionMatchMetaCache(
  matchId: string
): PredictionMatchMeta | null {
  const entry = cache.get(matchId);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(matchId);
    return null;
  }
  return entry.data;
}

export function setPredictionMatchMetaCache(data: PredictionMatchMeta) {
  cache.set(data.id, {
    data,
    expiresAt: Date.now() + PREDICTION_MATCH_META_TTL_MS,
  });
}

export function clearPredictionMatchMetaCache(matchId: string) {
  cache.delete(matchId);
}
