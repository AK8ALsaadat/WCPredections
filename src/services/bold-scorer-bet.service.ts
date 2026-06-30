import { resolveScorerGoalsForPlayer } from "@/lib/player-matching";
import { prisma } from "@/lib/prisma";
import { getPredictionLockReason } from "@/lib/utils";
import { revalidateTag } from "next/cache";
import {
  BOLD_SCORER_POINTS,
  calculateBoldScorerBetPoints,
} from "@/services/scoring.service";
import {
  canCombineDoubleAndBoldForUsageScope,
  getUsageRoundScope,
  isHighValueBoldScorerRound,
  type UsageRoundScope,
} from "@/services/usage-round.service";
import {
  getUserTotalPoints,
  invalidateUserTotalPointsCache,
  MIN_POINTS_FOR_BOLD_SCORER_BET,
} from "@/services/user-points.service";

export { BOLD_SCORER_POINTS };
export { MIN_POINTS_FOR_BOLD_SCORER_BET };

function revalidateUserMatchSummary(userId: string, matchId: string) {
  try {
    revalidateTag(`matches-user-${userId}`);
    revalidateTag(`match-${matchId}`);
  } catch {
    // Background/test contexts may not have a Next cache store.
  }
}

export async function getBoldScorerBetEligibility(userId: string) {
  const userPoints = await getUserTotalPoints(userId);

  return {
    userPoints,
    minimumPoints: MIN_POINTS_FOR_BOLD_SCORER_BET,
    hasMinimumPoints: userPoints >= MIN_POINTS_FOR_BOLD_SCORER_BET,
  };
}

export async function getBoldScorerBetForUserRound(
  userId: string,
  usageRoundKey: string
) {
  return prisma.boldScorerBet.findUnique({
    where: { userId_usageRoundKey: { userId, usageRoundKey } },
    include: {
      player: { select: { id: true, name: true, teamId: true } },
      match: { select: { id: true, homeTeamId: true, awayTeamId: true } },
    },
  });
}

async function normalizeBoldBetUsageKeyForMatch(
  userId: string,
  matchId: string,
  scope: UsageRoundScope
) {
  const existing = await getBoldScorerBetForUserRound(userId, scope.key);
  if (existing) return existing;

  const sameMatch = await prisma.boldScorerBet.findFirst({
    where: { userId, matchId, cancelledAt: null },
    include: {
      player: { select: { id: true, name: true, teamId: true } },
      match: { select: { id: true, homeTeamId: true, awayTeamId: true } },
    },
  });
  if (!sameMatch || sameMatch.usageRoundKey === scope.key) return sameMatch;

  try {
    return await prisma.boldScorerBet.update({
      where: { id: sameMatch.id },
      data: { usageRoundKey: scope.key },
      include: {
        player: { select: { id: true, name: true, teamId: true } },
        match: { select: { id: true, homeTeamId: true, awayTeamId: true } },
      },
    });
  } catch {
    return sameMatch;
  }
}

export async function getBoldScorerBetForMatch(userId: string, matchId: string) {
  const scope = await getUsageRoundScope(matchId);
  const bet = await normalizeBoldBetUsageKeyForMatch(userId, matchId, scope);
  if (bet?.matchId === matchId && !bet.cancelledAt) return bet;
  return null;
}

export async function getBoldScorerBetStatus(
  userId: string,
  matchId: string,
  knownScope?: UsageRoundScope
) {
  const scope = knownScope ?? (await getUsageRoundScope(matchId));

  const existing = await normalizeBoldBetUsageKeyForMatch(userId, matchId, scope);
  const isCancelled = !!existing?.cancelledAt;
  const activeOnThisMatch = existing?.matchId === matchId && !isCancelled;
  const activeOnOtherMatch = !!existing && existing.matchId !== matchId && !isCancelled;

  return {
    roundId: scope.key,
    used: !isCancelled && !!existing,
    onThisMatch: activeOnThisMatch,
    onOtherMatch: activeOnOtherMatch,
    bet:
      activeOnThisMatch
        ? {
            playerId: existing.playerId,
            playerName: existing.player.name,
            points: existing.points,
          }
        : null,
    otherMatchId:
      activeOnOtherMatch
        ? existing.matchId
        : null,
  };
}

export async function submitBoldScorerBet(
  userId: string,
  matchId: string,
  playerId: string | null
) {
  const match = await prisma.match.findUniqueOrThrow({
    where: { id: matchId },
    select: {
      id: true,
      roundId: true,
      homeTeamId: true,
      awayTeamId: true,
      matchTime: true,
      status: true,
    },
  });

  const lockReason = getPredictionLockReason(match.matchTime, match.status);
  if (lockReason) {
    throw new Error(lockReason);
  }

  const scope = await getUsageRoundScope(matchId, match.roundId);
  const existing = await normalizeBoldBetUsageKeyForMatch(userId, matchId, scope);

  // If no playerId is provided, treat as a cancellation request.
  if (!playerId) {
    if (!existing) return null;
    if (existing.matchId !== matchId) return null;

    await prisma.boldScorerBet.delete({ where: { id: existing.id } });
    revalidateUserMatchSummary(userId, matchId);
    return null;
  }

  if (!existing) {
    const totalPoints = await getUserTotalPoints(userId);
    if (totalPoints < MIN_POINTS_FOR_BOLD_SCORER_BET) {
      throw new Error(
        `You need at least ${MIN_POINTS_FOR_BOLD_SCORER_BET} points to use the scorer bet`
      );
    }
  }

  const allowDoubleWithBold = canCombineDoubleAndBoldForUsageScope(scope);

  const octopusBet = await prisma.octopusGoalkeeperBet.findUnique({
    where: {
      userId_usageRoundKey: { userId, usageRoundKey: scope.key },
    },
    select: { id: true, matchId: true, cancelledAt: true },
  });
  if (octopusBet && octopusBet.matchId !== matchId && !octopusBet.cancelledAt) {
    throw new Error("ما تقدر تستخدم الرهان والأخطبوط معاً على نفس المباراة");
  }

  const eligibility = await getBoldScorerBetEligibility(userId);
  if (
    !eligibility.hasMinimumPoints &&
    (!existing || existing.cancelledAt || existing.matchId !== matchId)
  ) {
    throw new Error(
      `تحتاج ${eligibility.minimumPoints} نقاط على الأقل لاستخدام الرهان`
    );
  }

  const player = await prisma.player.findFirst({
    where: {
      id: playerId,
      teamId: { in: [match.homeTeamId, match.awayTeamId] },
    },
  });

  if (!player) {
    throw new Error("اختيار لاعب غير صالح للبطاقة الجريئة");
  }

  const scorerPick = await prisma.scorerPrediction.findUnique({
    where: {
      userId_matchId_playerId: {
        userId,
        matchId,
        playerId,
      },
    },
    select: { id: true },
  });

  if (!scorerPick) {
    throw new Error(
      "لازم لاعب الرهان يكون من الهدافين اللي اخترتهم في نفس التوقع"
    );
  }

  if (existing && !existing.cancelledAt && existing.matchId !== matchId) {
    throw new Error(
      "استخدمت الرهان في مباراة ثانية هالجولة — مرة واحدة بس"
    );
  }

  const bet = await prisma.$transaction(async (tx) => {
    if (!allowDoubleWithBold) {
      await tx.prediction.updateMany({
        where: {
          userId,
          isDouble: true,
          matchId: { in: scope.matchIds },
        },
        data: { isDouble: false, doubleBonus: 0 },
      });
    }

    if (octopusBet?.matchId === matchId && !octopusBet.cancelledAt) {
      await tx.octopusGoalkeeperBet.delete({ where: { id: octopusBet.id } });
    }

    return tx.boldScorerBet.upsert({
      where: {
        userId_usageRoundKey: { userId, usageRoundKey: scope.key },
      },
      create: {
        userId,
        roundId: match.roundId,
        usageRoundKey: scope.key,
        matchId,
        playerId,
      },
      update: {
        matchId,
        playerId,
        points: 0,
        cancelledAt: null,
      },
      include: {
        player: { select: { id: true, name: true } },
      },
    });
  });
  revalidateUserMatchSummary(userId, matchId);
  return bet;
}

export async function calculateBoldScorerBetPointsForMatch(
  matchId: string,
  regulationGoalsByPlayer: Map<string, number>,
  actualScorers: {
    playerId: string;
    player: {
      name: string;
      teamId: string;
      team?: { name?: string | null } | null;
    };
  }[] = []
) {
  const [match, bets] = await Promise.all([
    prisma.match.findUnique({
      where: { id: matchId },
      select: { status: true, roundId: true },
    }),
    prisma.boldScorerBet.findMany({
      where: { matchId, cancelledAt: null },
      include: {
        player: {
          select: {
            name: true,
            teamId: true,
            team: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  const scope = match?.roundId ? await getUsageRoundScope(matchId, match.roundId) : null;
  const canDoubleBoost = scope ? isHighValueBoldScorerRound(scope) : false;
  const predictionRows =
    canDoubleBoost && bets.length > 0
      ? await prisma.prediction.findMany({
          where: {
            matchId,
            userId: { in: bets.map((bet) => bet.userId) },
          },
          select: { userId: true, isDouble: true },
        })
      : [];
  const doubleByUser = new Map(
    predictionRows.map((prediction) => [
      prediction.userId,
      prediction.isDouble,
    ])
  );

  for (const bet of bets) {
    const highValue = canDoubleBoost && doubleByUser.get(bet.userId) === true;
    const regulationGoals =
      resolveScorerGoalsForPlayer(
        bet.playerId,
        bet.player,
        regulationGoalsByPlayer,
        actualScorers
      ) ?? 0;
    const points =
      match?.status === "FINISHED"
        ? calculateBoldScorerBetPoints(regulationGoals, { highValue })
        : regulationGoals > 0
          ? (highValue ? 10 : BOLD_SCORER_POINTS)
          : 0;
    await prisma.boldScorerBet.update({
      where: { id: bet.id },
      data: { points },
    });
    invalidateUserTotalPointsCache(bet.userId);
    revalidateUserMatchSummary(bet.userId, matchId);
  }
}
