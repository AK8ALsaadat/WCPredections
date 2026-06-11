import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPredictionLockReason } from "@/lib/utils";
import { calculateBoldScorerBetPointsForMatch } from "@/services/bold-scorer-bet.service";
import {
  calculateFinishTypePoints,
  calculatePenaltyWinnerPoints,
  calculateScorePredictionPoints,
  calculateScorerPredictionPoints,
  getScorerGoalsForPoints,
  isMatchFinishedForScoring,
} from "@/services/scoring.service";

const MAX_DOUBLES_PER_ROUND = 2;

export async function countDoublesUsedInRound(
  userId: string,
  roundId: string,
  excludePredictionId?: string
): Promise<number> {
  const predictions = await prisma.prediction.findMany({
    where: {
      userId,
      isDouble: true,
      id: excludePredictionId ? { not: excludePredictionId } : undefined,
      match: { roundId },
    },
  });
  return predictions.length;
}

export async function validateDoubleUsage(
  userId: string,
  matchId: string,
  isDouble: boolean,
  excludePredictionId?: string
): Promise<void> {
  if (!isDouble) return;

  const match = await prisma.match.findUniqueOrThrow({
    where: { id: matchId },
    select: { roundId: true },
  });

  const doublesUsed = await countDoublesUsedInRound(
    userId,
    match.roundId,
    excludePredictionId
  );

  if (doublesUsed >= MAX_DOUBLES_PER_ROUND) {
    throw new Error(
      `يمكنك استخدام ${MAX_DOUBLES_PER_ROUND} مضاعفات فقط في كل جولة`
    );
  }
}

export async function submitPrediction(
  userId: string,
  data: {
    matchId: string;
    predHome: number;
    predAway: number;
    isDouble?: boolean;
    predictedFinishType?: "NINETY_MINUTES" | "EXTRA_TIME" | "PENALTIES" | null;
    predictedPenaltyWinnerTeamId?: string | null;
  }
) {
  const match = await prisma.match.findUniqueOrThrow({
    where: { id: data.matchId },
    include: { homeTeam: true, awayTeam: true },
  });

  const lockReason = getPredictionLockReason(match.matchTime);
  if (lockReason) {
    throw new Error(lockReason);
  }

  const isDouble = data.isDouble ?? false;
  await validateDoubleUsage(userId, data.matchId, isDouble);

  if (match.isKnockout && !data.predictedFinishType) {
    throw new Error("توقع طريقة الإنهاء مطلوب للمباريات الإقصائية");
  }

  if (
    data.predictedFinishType === "PENALTIES" &&
    data.predictedPenaltyWinnerTeamId
  ) {
    const validTeams = [match.homeTeamId, match.awayTeamId];
    if (!validTeams.includes(data.predictedPenaltyWinnerTeamId)) {
      throw new Error("يجب اختيار أحد فريقي المباراة كفائز بركلات الترجيح");
    }
  }

  return prisma.prediction.upsert({
    where: {
      userId_matchId: { userId, matchId: data.matchId },
    },
    create: {
      userId,
      matchId: data.matchId,
      predHome: data.predHome,
      predAway: data.predAway,
      isDouble,
      predictedFinishType: data.predictedFinishType ?? null,
      predictedPenaltyWinnerTeamId: data.predictedPenaltyWinnerTeamId ?? null,
    },
    update: {
      predHome: data.predHome,
      predAway: data.predAway,
      isDouble,
      predictedFinishType: data.predictedFinishType ?? null,
      predictedPenaltyWinnerTeamId: data.predictedPenaltyWinnerTeamId ?? null,
    },
    include: {
      match: {
        include: {
          homeTeam: true,
          awayTeam: true,
          round: true,
        },
      },
    },
  });
}

export async function submitScorerPredictions(
  userId: string,
  matchId: string,
  picks: { playerId: string; goals: number }[]
) {
  const match = await prisma.match.findUniqueOrThrow({
    where: { id: matchId },
  });

  const lockReason = getPredictionLockReason(match.matchTime);
  if (lockReason) {
    throw new Error(lockReason);
  }

  const playerIds = picks.map((p) => p.playerId);
  const players = await prisma.player.findMany({
    where: {
      id: { in: playerIds },
      teamId: { in: [match.homeTeamId, match.awayTeamId] },
    },
  });

  if (players.length !== playerIds.length) {
    throw new Error("اختيار لاعب غير صالح");
  }

  const prediction = await prisma.prediction.findUnique({
    where: { userId_matchId: { userId, matchId } },
    include: {
      match: {
        include: {
          homeTeam: { select: { shortName: true } },
          awayTeam: { select: { shortName: true } },
        },
      },
    },
  });

  if (!prediction) {
    throw new Error("سجّل النتيجة أولاً ثم اختر الهدافين");
  }

  let homeGoals = 0;
  let awayGoals = 0;
  for (const pick of picks) {
    const player = players.find((p) => p.id === pick.playerId);
    if (!player) continue;
    if (player.teamId === match.homeTeamId) {
      homeGoals += pick.goals;
    } else {
      awayGoals += pick.goals;
    }
  }

  if (homeGoals > prediction.predHome) {
    throw new Error(
      `أهداف ${prediction.match.homeTeam.shortName} (${homeGoals}) زادت عن النتيجة المتوقعة (${prediction.predHome})`
    );
  }
  if (awayGoals > prediction.predAway) {
    throw new Error(
      `أهداف ${prediction.match.awayTeam.shortName} (${awayGoals}) زادت عن النتيجة المتوقعة (${prediction.predAway})`
    );
  }

  if (
    picks.length === 0 &&
    (prediction.predHome > 0 || prediction.predAway > 0)
  ) {
    throw new Error("اختر اللاعبين اللي بيسجلون حسب النتيجة");
  }

  await prisma.scorerPrediction.deleteMany({
    where: { userId, matchId },
  });

  await prisma.scorerPrediction.createMany({
    data: picks.map((pick) => ({
      userId,
      matchId,
      playerId: pick.playerId,
      predictedGoals: pick.goals,
    })),
  });

  return prisma.scorerPrediction.findMany({
    where: { userId, matchId },
    include: { player: true },
  });
}

export async function calculateMatchPoints(matchId: string): Promise<void> {
  const match = await prisma.match.findUniqueOrThrow({
    where: { id: matchId },
    include: {
      matchScorers: {
        include: { player: { select: { teamId: true } } },
      },
    },
  });

  if (!isMatchFinishedForScoring(match)) {
    throw new Error("Match is not finished or scores are missing");
  }

  const predictions = await prisma.prediction.findMany({
    where: { matchId },
  });

  for (const prediction of predictions) {
    const scorePoints = calculateScorePredictionPoints(
      prediction.predHome,
      prediction.predAway,
      match.homeScore!,
      match.awayScore!,
      prediction.isDouble
    );

    const finishTypePoints = match.isKnockout
      ? calculateFinishTypePoints(
          prediction.predictedFinishType,
          match.actualFinishType
        )
      : 0;

    const penaltyWinnerPoints =
      match.isKnockout && match.actualFinishType === "PENALTIES"
        ? calculatePenaltyWinnerPoints(
            prediction.predictedPenaltyWinnerTeamId,
            match.penaltyWinnerTeamId
          )
        : 0;

    await prisma.prediction.update({
      where: { id: prediction.id },
      data: { points: scorePoints, finishTypePoints, penaltyWinnerPoints },
    });
  }

  const scorerPredictions = await prisma.scorerPrediction.findMany({
    where: { matchId },
  });

  const scorerGoalsByPlayer = getScorerGoalsForPoints(
    {
      actualFinishType: match.actualFinishType,
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      homeScore: match.homeScore!,
      awayScore: match.awayScore!,
    },
    match.matchScorers
  );

  for (const sp of scorerPredictions) {
    const points = calculateScorerPredictionPoints(
      sp.predictedGoals,
      scorerGoalsByPlayer.get(sp.playerId)
    );
    await prisma.scorerPrediction.update({
      where: { id: sp.id },
      data: { points },
    });
  }

  await calculateBoldScorerBetPointsForMatch(matchId, scorerGoalsByPlayer);

  revalidateTag("leaderboard-overall");
  revalidateTag(`leaderboard-round-${match.roundId}`);
}

export async function calculateRoundPoints(roundId: string): Promise<void> {
  const matches = await prisma.match.findMany({
    where: { roundId, status: "FINISHED" },
    select: { id: true },
  });

  for (const match of matches) {
    await calculateMatchPoints(match.id);
  }
}

export async function getUserPredictionHistory(userId: string) {
  const predictions = await prisma.prediction.findMany({
    where: { userId },
    include: {
      match: {
        include: {
          homeTeam: true,
          awayTeam: true,
          round: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const scorerPredictions = await prisma.scorerPrediction.findMany({
    where: { userId },
    include: {
      player: true,
      match: {
        include: {
          homeTeam: true,
          awayTeam: true,
          round: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return { predictions, scorerPredictions };
}
