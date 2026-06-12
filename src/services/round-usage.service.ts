import { getBoldScorerBetStatus } from "@/services/bold-scorer-bet.service";
import { MAX_DOUBLES_PER_ROUND } from "@/services/prediction.service";
import { prisma } from "@/lib/prisma";

export const MAX_BOLD_SCORER_BETS_PER_ROUND = 1;

export async function getRoundUsageLimits(
  userId: string,
  matchId: string,
  roundId?: string
) {
  const resolvedRoundId =
    roundId ??
    (
      await prisma.match.findUniqueOrThrow({
        where: { id: matchId },
        select: { roundId: true },
      })
    ).roundId;

  const [roundPredictions, boldStatus] = await Promise.all([
    prisma.prediction.findMany({
      where: {
        userId,
        match: { roundId: resolvedRoundId },
      },
      select: { matchId: true, isDouble: true },
    }),
    getBoldScorerBetStatus(userId, matchId, resolvedRoundId),
  ]);

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
    doubles: {
      used: doublesInRound,
      max: MAX_DOUBLES_PER_ROUND,
      onThisMatch: doubleOnThisMatch,
      canEnable: doublesUsedElsewhere < MAX_DOUBLES_PER_ROUND,
      remaining: Math.max(0, MAX_DOUBLES_PER_ROUND - doublesUsedElsewhere),
    },
    boldScorer: {
      used: boldStatus.used,
      max: MAX_BOLD_SCORER_BETS_PER_ROUND,
      onThisMatch: boldStatus.onThisMatch,
      onOtherMatch: boldStatus.onOtherMatch,
      canUse: !boldStatus.used || boldStatus.onThisMatch,
      otherMatchId: boldStatus.otherMatchId,
      playerName: boldStatus.bet?.playerName ?? null,
      playerId: boldStatus.bet?.playerId ?? null,
      points: boldStatus.bet?.points ?? 0,
    },
  };
}
