import { getBoldScorerBetStatus } from "@/services/bold-scorer-bet.service";
import { getOctopusBetStatus } from "@/services/octopus-bet.service";
import { prisma } from "@/lib/prisma";
import {
  canCombineDoubleAndBoldForUsageScope,
  getMaxDoublesForUsageScope,
  getUsageRoundScope,
  getUsageRoundPhase,
  isHighValueBoldScorerRound,
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
  const phase = getUsageRoundPhase(scope);
  const allowDoubleWithBold = canCombineDoubleAndBoldForUsageScope(scope);
  const canDoubleBoostBoldScorer = isHighValueBoldScorerRound(scope);

  const doubleOnThisMatch =
    roundPredictions.find((prediction) => prediction.matchId === matchId)
      ?.isDouble ?? false;
  const doublesInRound = roundPredictions.filter(
    (prediction) => prediction.isDouble
  ).length;
  const doublesUsedElsewhere =
    doublesInRound - (doubleOnThisMatch ? 1 : 0);
  const highValueBoldScorer = canDoubleBoostBoldScorer && doubleOnThisMatch;

  return {
    roundId: resolvedRoundId,
    usageRoundKey: scope.key,
    phase,
    allowDoubleWithBold,
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
      highValue: highValueBoldScorer,
      canDoubleBoost: canDoubleBoostBoldScorer,
      pointsForHit: highValueBoldScorer ? 10 : 5,
      pointsForMiss: highValueBoldScorer ? -10 : -5,
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
