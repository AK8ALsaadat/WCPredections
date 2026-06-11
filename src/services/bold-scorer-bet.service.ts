import { prisma } from "@/lib/prisma";
import { getPredictionLockReason } from "@/lib/utils";
import {
  BOLD_SCORER_POINTS,
  calculateBoldScorerBetPoints,
} from "@/services/scoring.service";

export { BOLD_SCORER_POINTS };

export async function getBoldScorerBetForUserRound(
  userId: string,
  roundId: string
) {
  return prisma.boldScorerBet.findUnique({
    where: { userId_roundId: { userId, roundId } },
    include: {
      player: { select: { id: true, name: true, teamId: true } },
      match: { select: { id: true, homeTeamId: true, awayTeamId: true } },
    },
  });
}

export async function getBoldScorerBetForMatch(userId: string, matchId: string) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { roundId: true },
  });
  if (!match) return null;
  const bet = await getBoldScorerBetForUserRound(userId, match.roundId);
  if (bet?.matchId === matchId) return bet;
  return null;
}

export async function getBoldScorerBetStatus(
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

  const existing = await getBoldScorerBetForUserRound(
    userId,
    resolvedRoundId
  );

  return {
    roundId: resolvedRoundId,
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

  const existing = await prisma.boldScorerBet.findUnique({
    where: { userId_roundId: { userId, roundId: match.roundId } },
  });

  if (!playerId) {
    if (existing?.matchId === matchId) {
      throw new Error("ما تقدر تلغي البطاقة الجريئة بعد تفعيلها");
    }
    return null;
  }

  if (existing?.matchId === matchId && existing.playerId !== playerId) {
    throw new Error("ما تقدر تغيّر لاعب البطاقة الجريئة بعد تفعيلها");
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
      "استخدمت بطاقتك الجريئة في مباراة ثانية هالجولة — مرة واحدة بس"
    );
  }

  return prisma.boldScorerBet.upsert({
    where: {
      userId_roundId: { userId, roundId: match.roundId },
    },
    create: {
      userId,
      roundId: match.roundId,
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
  regulationGoalsByPlayer: Map<string, number>
) {
  const bets = await prisma.boldScorerBet.findMany({
    where: { matchId },
  });

  for (const bet of bets) {
    const regulationGoals = regulationGoalsByPlayer.get(bet.playerId) ?? 0;
    const points = calculateBoldScorerBetPoints(regulationGoals);
    await prisma.boldScorerBet.update({
      where: { id: bet.id },
      data: { points },
    });
  }
}
