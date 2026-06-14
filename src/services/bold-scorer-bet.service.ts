import { resolveScorerGoalsForPlayer } from "@/lib/player-matching";
import { prisma } from "@/lib/prisma";
import { getPredictionLockReason } from "@/lib/utils";
import {
  BOLD_SCORER_POINTS,
  calculateBoldScorerBetPoints,
} from "@/services/scoring.service";
import { getUsageRoundScope } from "@/services/usage-round.service";
import {
  getUserTotalPoints,
  MIN_POINTS_FOR_BOLD_SCORER_BET,
} from "@/services/user-points.service";

export { BOLD_SCORER_POINTS };

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

export async function getBoldScorerBetForMatch(userId: string, matchId: string) {
  const scope = await getUsageRoundScope(matchId);
  const bet = await getBoldScorerBetForUserRound(userId, scope.key);
  if (bet?.matchId === matchId) return bet;
  return null;
}

export async function getBoldScorerBetStatus(
  userId: string,
  matchId: string
) {
  const scope = await getUsageRoundScope(matchId);

  const existing = await getBoldScorerBetForUserRound(
    userId,
    scope.key
  );

  return {
    roundId: scope.key,
    used: !!existing,
    onThisMatch: existing?.matchId === matchId,
    onOtherMatch: !!existing && existing.matchId !== matchId,
    bet:
      existing?.matchId === matchId
        ? {
            playerId: existing.playerId,
            playerName: existing.player.name,
            points: existing.points,
          }
        : null,
    otherMatchId: existing && existing.matchId !== matchId ? existing.matchId : null,
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

  const scope = await getUsageRoundScope(matchId);
  const existing = await prisma.boldScorerBet.findUnique({
    where: {
      userId_usageRoundKey: { userId, usageRoundKey: scope.key },
    },
  });

  // If no playerId is provided, treat as a cancellation request.
  if (!playerId) {
    if (!existing) return null;
    if (existing.matchId !== matchId) return null;

    // allow cancellation prior to lock (lockReason was checked above)
    await prisma.boldScorerBet.delete({ where: { id: existing.id } });
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

  if (existing?.matchId === matchId && existing.playerId !== playerId) {
    throw new Error("ما تقدر تغيّر لاعب الرهان بعد تفعيله");
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

  if (existing && existing.matchId !== matchId) {
    throw new Error(
      "استخدمت الرهان في مباراة ثانية هالجولة — مرة واحدة بس"
    );
  }

  return prisma.boldScorerBet.upsert({
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
    },
    include: {
      player: { select: { id: true, name: true } },
    },
  });
}

export async function calculateBoldScorerBetPointsForMatch(
  matchId: string,
  regulationGoalsByPlayer: Map<string, number>,
  actualScorers: {
    playerId: string;
    player: { name: string; teamId: string };
  }[] = []
) {
  const [match, bets] = await Promise.all([
    prisma.match.findUnique({
      where: { id: matchId },
      select: { status: true },
    }),
    prisma.boldScorerBet.findMany({
      where: { matchId },
      include: {
        player: { select: { name: true, teamId: true } },
      },
    }),
  ]);

  for (const bet of bets) {
    const regulationGoals =
      resolveScorerGoalsForPlayer(
        bet.playerId,
        bet.player,
        regulationGoalsByPlayer,
        actualScorers
      ) ?? 0;
    const points =
      match?.status === "FINISHED"
        ? calculateBoldScorerBetPoints(regulationGoals)
        : regulationGoals > 0
          ? BOLD_SCORER_POINTS
          : 0;
    await prisma.boldScorerBet.update({
      where: { id: bet.id },
      data: { points },
    });
  }
}
