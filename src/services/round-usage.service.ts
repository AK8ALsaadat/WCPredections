import { getBoldScorerBetStatus } from "@/services/bold-scorer-bet.service";
import {
  countDoublesUsedInRound,
  MAX_DOUBLES_PER_ROUND,
} from "@/services/prediction.service";
import { prisma } from "@/lib/prisma";

export const MAX_BOLD_SCORER_BETS_PER_ROUND = 1;

export async function getRoundUsageLimits(userId: string, matchId: string) {
  const match = await prisma.match.findUniqueOrThrow({
    where: { id: matchId },
    select: { id: true, roundId: true },
  });

  const existingPrediction = await prisma.prediction.findUnique({
    where: { userId_matchId: { userId, matchId } },
    select: { id: true, isDouble: true },
  });

  const [doublesInRound, doublesUsedElsewhere, boldStatus] = await Promise.all([
    countDoublesUsedInRound(userId, match.roundId),
    countDoublesUsedInRound(
      userId,
      match.roundId,
      existingPrediction?.id
    ),
    getBoldScorerBetStatus(userId, matchId),
  ]);

  const doubleOnThisMatch = existingPrediction?.isDouble ?? false;

  return {
    roundId: match.roundId,
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
    },
  };
}
