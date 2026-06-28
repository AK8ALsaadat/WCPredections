import { getBoldScorerBetStatus } from "@/services/bold-scorer-bet.service";
import { getOctopusBetStatus } from "@/services/octopus-bet.service";
import { MAX_DOUBLES_PER_ROUND } from "@/services/prediction.service";
import { prisma } from "@/lib/prisma";
import {
  getMaxDoublesForUsageScope,
  getUsageRoundScope,
  getUsageRoundPhase,
} from "@/services/usage-round.service";
import {
  getUserTotalPoints,
  MIN_POINTS_FOR_BOLD_SCORER_BET,
} from "@/services/user-points.service";

export const MAX_BOLD_SCORER_BETS_PER_ROUND = 1;
export { MIN_POINTS_FOR_BOLD_SCORER_BET } from "@/services/user-points.service";

export async function getRoundUsageLimits(
  userId: string,
  matchId: string,
  roundId?: string
) {
  const scope = await getUsageRoundScope(matchId, roundId);
  const resolvedRoundId = roundId ?? scope.databaseRoundId;

  const [roundPredictions, boldStatus, octopusStatus, totalPoints] = await Promise.all([
    prisma.prediction.findMany({
      where: {
        userId,
        matchId: { in: scope.matchIds },
      },
      select: { matchId: true, isDouble: true },
    }),
    getBoldScorerBetStatus(userId, matchId, scope),
    getOctopusBetStatus(userId, matchId, scope),
    getUserTotalPoints(userId),
  ]);
  const hasBoldPoints = totalPoints >= MIN_POINTS_FOR_BOLD_SCORER_BET;
  const maxDoubles = getMaxDoublesForUsageScope(scope);

  const doubleOnThisMatch =
    roundPredictions.find((prediction) => prediction.matchId === matchId)
      ?.isDouble ?? false;
  const doublesInRound = roundPredictions.filter(
    (prediction) => prediction.isDouble
  ).length;
  const doublesUsedElsewhere =
    doublesInRound - (doubleOnThisMatch ? 1 : 0);

  return {
    roundId: resolvedRoundId,
    usageRoundKey: scope.key,
    phase: getUsageRoundPhase(scope),
    doubles: {
      used: doublesInRound,
      max: maxDoubles,
      onThisMatch: doubleOnThisMatch,
      canEnable: doublesUsedElsewhere < maxDoubles,
      remaining: Math.max(0, maxDoubles - doublesUsedElsewhere),
    },
    boldScorer: {
      used: boldStatus.used,
      max: MAX_BOLD_SCORER_BETS_PER_ROUND,
      onThisMatch: boldStatus.onThisMatch,
      onOtherMatch: boldStatus.onOtherMatch,
      canUse:
        boldStatus.onThisMatch ||
        (hasBoldPoints && !boldStatus.used),
      hasMinimumPoints: hasBoldPoints,
      minimumPoints: MIN_POINTS_FOR_BOLD_SCORER_BET,
      userPoints: totalPoints,
      otherMatchId: boldStatus.otherMatchId,
      playerName: boldStatus.bet?.playerName ?? null,
      playerId: boldStatus.bet?.playerId ?? null,
      points: boldStatus.bet?.points ?? 0,
    },
    octopus: {
      used: octopusStatus.used,
      max: 1,
      onThisMatch: octopusStatus.onThisMatch,
      onOtherMatch: octopusStatus.onOtherMatch,
      canUse: octopusStatus.onThisMatch || !octopusStatus.used,
      otherMatchId: octopusStatus.otherMatchId,
      playerName: octopusStatus.bet?.playerName ?? null,
      playerId: octopusStatus.bet?.playerId ?? null,
      points: octopusStatus.bet?.points ?? 0,
    },
  };
}
