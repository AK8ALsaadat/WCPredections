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

export const MAX_DOUBLES_PER_ROUND = 2;

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

  const lockReason = getPredictionLockReason(match.matchTime, match.status);
  if (lockReason) {
    throw new Error(lockReason);
  }

  const existing = await prisma.prediction.findUnique({
    where: { userId_matchId: { userId, matchId: data.matchId } },
    select: { id: true, isDouble: true },
  });

  const isDouble = data.isDouble ?? false;

  if (existing?.isDouble && !isDouble) {
    throw new Error("ما تقدر تلغي المضاعفة بعد تفعيلها");
  }

  await validateDoubleUsage(
    userId,
    data.matchId,
    isDouble,
    existing?.id
  );

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

async function validateScorerPicks(
  match: {
    homeTeamId: string;
    awayTeamId: string;
    homeTeam: { shortName: string };
    awayTeam: { shortName: string };
  },
  predHome: number,
  predAway: number,
  picks: { playerId: string; goals: number }[]
) {
  const playerIds = picks.map((p) => p.playerId);
  const players =
    playerIds.length === 0
      ? []
      : await prisma.player.findMany({
          where: {
            id: { in: playerIds },
            teamId: { in: [match.homeTeamId, match.awayTeamId] },
          },
        });

  if (players.length !== playerIds.length) {
    throw new Error("اختيار لاعب غير صالح");
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

  if (homeGoals > predHome) {
    throw new Error(
      `أهداف ${match.homeTeam.shortName} (${homeGoals}) زادت عن النتيجة المتوقعة (${predHome})`
    );
  }
  if (awayGoals > predAway) {
    throw new Error(
      `أهداف ${match.awayTeam.shortName} (${awayGoals}) زادت عن النتيجة المتوقعة (${predAway})`
    );
  }

  if (picks.length === 0 && (predHome > 0 || predAway > 0)) {
    throw new Error("اختر اللاعبين اللي بيسجلون حسب النتيجة");
  }
}

async function replaceScorerPredictions(
  userId: string,
  matchId: string,
  picks: { playerId: string; goals: number }[]
) {
  const existing = await prisma.scorerPrediction.findMany({
    where: { userId, matchId },
    select: { playerId: true },
  });
  const newIds = new Set(picks.map((p) => p.playerId));
  const toRemove = existing
    .map((row) => row.playerId)
    .filter((playerId) => !newIds.has(playerId));

  if (toRemove.length > 0) {
    await prisma.scorerPrediction.deleteMany({
      where: { userId, matchId, playerId: { in: toRemove } },
    });
  }

  for (const pick of picks) {
    await prisma.scorerPrediction.upsert({
      where: {
        userId_matchId_playerId: {
          userId,
          matchId,
          playerId: pick.playerId,
        },
      },
      create: {
        userId,
        matchId,
        playerId: pick.playerId,
        predictedGoals: pick.goals,
      },
      update: {
        predictedGoals: pick.goals,
        points: 0,
      },
    });
  }
}

export async function submitScorerPredictions(
  userId: string,
  matchId: string,
  picks: { playerId: string; goals: number }[]
) {
  const match = await prisma.match.findUniqueOrThrow({
    where: { id: matchId },
    include: {
      homeTeam: { select: { shortName: true } },
      awayTeam: { select: { shortName: true } },
    },
  });

  const lockReason = getPredictionLockReason(match.matchTime, match.status);
  if (lockReason) {
    throw new Error(lockReason);
  }

  const prediction = await prisma.prediction.findUnique({
    where: { userId_matchId: { userId, matchId } },
  });

  if (!prediction) {
    throw new Error("سجّل النتيجة أولاً ثم اختر الهدافين");
  }

  await validateScorerPicks(
    match,
    prediction.predHome,
    prediction.predAway,
    picks
  );

  await replaceScorerPredictions(userId, matchId, picks);

  return prisma.scorerPrediction.findMany({
    where: { userId, matchId },
    include: { player: true },
  });
}

export async function submitMatchPredictionBundle(
  userId: string,
  data: {
    matchId: string;
    predHome: number;
    predAway: number;
    isDouble?: boolean;
    predictedFinishType?: "NINETY_MINUTES" | "EXTRA_TIME" | "PENALTIES" | null;
    predictedPenaltyWinnerTeamId?: string | null;
    picks: { playerId: string; goals: number }[];
    boldPlayerId: string | null;
  }
) {
  const match = await prisma.match.findUniqueOrThrow({
    where: { id: data.matchId },
    include: {
      homeTeam: { select: { shortName: true } },
      awayTeam: { select: { shortName: true } },
    },
  });

  const lockReason = getPredictionLockReason(match.matchTime, match.status);
  if (lockReason) {
    throw new Error(lockReason);
  }

  const existing = await prisma.prediction.findUnique({
    where: { userId_matchId: { userId, matchId: data.matchId } },
    select: { id: true, isDouble: true },
  });

  const isDouble = data.isDouble ?? false;

  if (existing?.isDouble && !isDouble) {
    throw new Error("ما تقدر تلغي المضاعفة بعد تفعيلها");
  }
  await validateDoubleUsage(
    userId,
    data.matchId,
    isDouble,
    existing?.id
  );

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

  await validateScorerPicks(
    match,
    data.predHome,
    data.predAway,
    data.picks
  );

  if (data.boldPlayerId) {
    const boldPlayer = await prisma.player.findFirst({
      where: {
        id: data.boldPlayerId,
        teamId: { in: [match.homeTeamId, match.awayTeamId] },
      },
    });
    if (!boldPlayer) {
      throw new Error("اختيار لاعب غير صالح للبطاقة الجريئة");
    }
  }

  // Sequential writes — interactive $transaction breaks on Supabase PgBouncer (pooler).
  if (isDouble) {
    const doublesUsed = await prisma.prediction.count({
      where: {
        userId,
        isDouble: true,
        id: existing?.id ? { not: existing.id } : undefined,
        match: { roundId: match.roundId },
      },
    });
    if (doublesUsed >= MAX_DOUBLES_PER_ROUND) {
      throw new Error(
        `يمكنك استخدام ${MAX_DOUBLES_PER_ROUND} مضاعفات فقط في كل جولة`
      );
    }
  }

  const storedBold = await prisma.boldScorerBet.findUnique({
    where: { userId_roundId: { userId, roundId: match.roundId } },
  });

  if (storedBold?.matchId === data.matchId) {
    if (!data.boldPlayerId) {
      throw new Error("ما تقدر تلغي البطاقة الجريئة بعد تفعيلها");
    }
    if (data.boldPlayerId !== storedBold.playerId) {
      throw new Error("ما تقدر تغيّر لاعب البطاقة الجريئة بعد تفعيلها");
    }
  } else if (
    data.boldPlayerId &&
    storedBold &&
    storedBold.matchId !== data.matchId
  ) {
    throw new Error(
      "استخدمت بطاقتك الجريئة في مباراة ثانية هالجولة — مرة واحدة بس"
    );
  }

  const prediction = await prisma.prediction.upsert({
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
      predictedPenaltyWinnerTeamId:
        data.predictedPenaltyWinnerTeamId ?? null,
    },
    update: {
      predHome: data.predHome,
      predAway: data.predAway,
      isDouble,
      predictedFinishType: data.predictedFinishType ?? null,
      predictedPenaltyWinnerTeamId:
        data.predictedPenaltyWinnerTeamId ?? null,
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

  await replaceScorerPredictions(userId, data.matchId, data.picks);

  let boldBet = null;
  if (data.boldPlayerId) {
    boldBet = await prisma.boldScorerBet.upsert({
      where: {
        userId_roundId: { userId, roundId: match.roundId },
      },
      create: {
        userId,
        roundId: match.roundId,
        matchId: data.matchId,
        playerId: data.boldPlayerId,
      },
      update: {
        matchId: data.matchId,
        playerId: data.boldPlayerId,
        points: 0,
      },
      include: {
        player: { select: { id: true, name: true } },
      },
    });
  }

  const scorers = await prisma.scorerPrediction.findMany({
    where: { userId, matchId: data.matchId },
    include: { player: true },
  });

  return { prediction, scorers, boldBet };
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

  const boldScorerBets = await prisma.boldScorerBet.findMany({
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

  return { predictions, scorerPredictions, boldScorerBets };
}
