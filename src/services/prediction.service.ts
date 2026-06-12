import type { FinishType } from "@prisma/client";
import { revalidateTag } from "next/cache";
import { resolveScorerGoalsForPlayer } from "@/lib/player-matching";
import { prisma } from "@/lib/prisma";
import { getPredictionLockReason, isPredictionAllowed } from "@/lib/utils";
import {
  MAX_SCORERS_PER_TEAM,
  MAX_SCORERS_TOTAL,
} from "@/lib/scorer-prediction";
import type { LeagueMatchPredictionRow } from "@/types";
import { calculateBoldScorerBetPointsForMatch } from "@/services/bold-scorer-bet.service";
import {
  calculateFinishTypePoints,
  calculatePenaltyWinnerPoints,
  calculatePerfectPredictionBonus,
  calculatePerfectPredictionBonusWithMinute,
  calculateScorePredictionPoints,
  calculateScorerPredictionPoints,
  getScorerGoalsForPoints,
  isExactScorePrediction,
  isMatchEligibleForScorerPoints,
  PERFECT_PREDICTION_MIN_MINUTE,
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
  let homeScorers = 0;
  let awayScorers = 0;
  for (const pick of picks) {
    const player = players.find((p) => p.id === pick.playerId);
    if (!player) continue;
    if (player.teamId === match.homeTeamId) {
      homeGoals += pick.goals;
      homeScorers++;
    } else {
      awayGoals += pick.goals;
      awayScorers++;
    }
  }

  if (homeScorers > predHome) {
    throw new Error(
      `عدد هدافي ${match.homeTeam.shortName} (${homeScorers}) زاد عن أهدافه المتوقعة (${predHome})`
    );
  }
  if (awayScorers > predAway) {
    throw new Error(
      `عدد هدافي ${match.awayTeam.shortName} (${awayScorers}) زاد عن أهدافه المتوقعة (${predAway})`
    );
  }

  if (homeScorers > MAX_SCORERS_PER_TEAM) {
    throw new Error(
      `أقصى عدد هدافين تقدر تختارهم من ${match.homeTeam.shortName} هو ${MAX_SCORERS_PER_TEAM}`
    );
  }
  if (awayScorers > MAX_SCORERS_PER_TEAM) {
    throw new Error(
      `أقصى عدد هدافين تقدر تختارهم من ${match.awayTeam.shortName} هو ${MAX_SCORERS_PER_TEAM}`
    );
  }
  if (homeScorers + awayScorers > MAX_SCORERS_TOTAL) {
    throw new Error(
      `أقصى عدد هدافين تقدر تختارهم لكل المباراة هو ${MAX_SCORERS_TOTAL}`
    );
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

  if (predHome > 0 && homeGoals !== predHome) {
    throw new Error(
      `لازم توزّع ${predHome} ${predHome === 1 ? "هدف" : "أهداف"} على هدافي ${match.homeTeam.shortName} (حالياً ${homeGoals})`
    );
  }
  if (predAway > 0 && awayGoals !== predAway) {
    throw new Error(
      `لازم توزّع ${predAway} ${predAway === 1 ? "هدف" : "أهداف"} على هدافي ${match.awayTeam.shortName} (حالياً ${awayGoals})`
    );
  }
  if (predHome === 0 && homeGoals > 0) {
    throw new Error(`ما فيه أهداف متوقعة لـ ${match.homeTeam.shortName}`);
  }
  if (predAway === 0 && awayGoals > 0) {
    throw new Error(`ما فيه أهداف متوقعة لـ ${match.awayTeam.shortName}`);
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

  // ✅ منع استخدام الـ Double والـ Bold معاً على نفس المباراة
  if (isDouble && data.boldPlayerId) {
    throw new Error(
      "ما تقدر تستخدم المضاعفة والبطاقة الجريئة معاً على نفس المباراة"
    );
  }

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

type ScorerPredictionWithPlayer = {
  id: string;
  userId: string;
  playerId: string;
  predictedGoals: number;
  player: { name: string; teamId: string; position?: string | null };
};

async function applyScorerAndBoldPoints(
  match: {
    id: string;
    roundId: string;
    homeTeamId: string;
    awayTeamId: string;
    homeScore: number;
    awayScore: number;
    actualFinishType: FinishType | null;
    matchScorers: {
      playerId: string;
      goals: number;
      player: { teamId: string; name: string };
    }[];
  },
  scorerGoalsByPlayer: Map<string, number>,
  scorerPredictions: ScorerPredictionWithPlayer[]
  ,
  ignorePositionMultiplier = false
) {
  for (const sp of scorerPredictions) {
    const actualGoals = resolveScorerGoalsForPlayer(
      sp.playerId,
      sp.player,
      scorerGoalsByPlayer,
      match.matchScorers
    );
    const points = calculateScorerPredictionPoints(
      sp.predictedGoals,
      actualGoals,
      sp.player.position as any,
      { ignorePositionMultiplier }
    );
    await prisma.scorerPrediction.update({
      where: { id: sp.id },
      data: { points },
    });
  }

  await calculateBoldScorerBetPointsForMatch(
    match.id,
    scorerGoalsByPlayer,
    match.matchScorers
  );
}

export async function recalculateMatchScoring(matchId: string): Promise<void> {
  const match = await prisma.match.findUniqueOrThrow({
    where: { id: matchId },
    include: {
      matchScorers: {
        include: { player: { select: { teamId: true, name: true } } },
      },
    },
  });

  // Determine whether this match is one of the two most recently finished matches.
  const lastTwoFinished = await prisma.match.findMany({
    where: { status: "FINISHED" },
    orderBy: { matchTime: "desc" },
    take: 2,
    select: { id: true },
  });
  const ignorePositionMultiplier = lastTwoFinished.some((m) => m.id === match.id);

  const finished = isMatchFinishedForScoring(match);
  const canScoreScorers = isMatchEligibleForScorerPoints(match);

  if (!finished && !canScoreScorers) {
    throw new Error("Match is not eligible for scoring");
  }

  const scorerGoalsByPlayer = canScoreScorers
    ? getScorerGoalsForPoints(
        {
          actualFinishType: match.actualFinishType,
          homeTeamId: match.homeTeamId,
          awayTeamId: match.awayTeamId,
          homeScore: match.homeScore!,
          awayScore: match.awayScore!,
        },
        match.matchScorers
      )
    : null;

  const scorerPredictions = canScoreScorers
    ? await prisma.scorerPrediction.findMany({
        where: { matchId },
        include: { player: { select: { name: true, teamId: true, position: true } } },
      })
    : [];

  if (finished) {
    const predictions = await prisma.prediction.findMany({
      where: { matchId },
    });

    const picksByUser = new Map<string, ScorerPredictionWithPlayer[]>();
    for (const sp of scorerPredictions) {
      const list = picksByUser.get(sp.userId) ?? [];
      list.push(sp);
      picksByUser.set(sp.userId, list);
    }

    for (const prediction of predictions) {
      const scorePoints = calculateScorePredictionPoints(
        prediction.predHome,
        prediction.predAway,
        match.homeScore!,
        match.awayScore!,
        prediction.isDouble
      );

      let bonusPoints = 0;
      if (scorerGoalsByPlayer) {
        const isExact = isExactScorePrediction(
          prediction.predHome,
          prediction.predAway,
          match.homeScore!,
          match.awayScore!
        );
        const picks = picksByUser.get(prediction.userId) ?? [];
        
        // استخدم الدالة الجديدة التي تتحقق من الدقيقة 75
        bonusPoints = calculatePerfectPredictionBonusWithMinute(
          isExact,
          picks.map((sp) => ({
            predictedGoals: sp.predictedGoals,
            actualGoals: resolveScorerGoalsForPlayer(
              sp.playerId,
              sp.player,
              scorerGoalsByPlayer,
              match.matchScorers
            ),
            position: sp.player.position,
          })),
          match.matchTime,
          match.status,
          { ignorePositionMultiplier }
        );
      }

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
        data: {
          points: scorePoints + bonusPoints,
          finishTypePoints,
          penaltyWinnerPoints,
        },
      });
    }
  }

  if (canScoreScorers && scorerGoalsByPlayer) {
    await applyScorerAndBoldPoints(
      {
        id: match.id,
        roundId: match.roundId,
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
        homeScore: match.homeScore!,
        awayScore: match.awayScore!,
        actualFinishType: match.actualFinishType,
        matchScorers: match.matchScorers,
      },
      scorerGoalsByPlayer,
      scorerPredictions,
      ignorePositionMultiplier
    );
  }

  try {
    revalidateTag("leaderboard-overall");
    revalidateTag(`leaderboard-round-${match.roundId}`);
    revalidateTag("matches-schedule");
    revalidateTag(`match-${match.id}`);
  } catch (err) {
    // Revalidation may not be available in some background contexts (e.g. timers).
    // Don't fail scoring because of cache revalidation errors.
    // Log a warning for visibility.
    // eslint-disable-next-line no-console
    console.warn("[revalidate] skipped due to missing store:", err instanceof Error ? err.message : err);
  }
}

export async function calculateMatchPoints(matchId: string): Promise<void> {
  await recalculateMatchScoring(matchId);
}

export async function calculateRoundPoints(roundId: string): Promise<void> {
  const matches = await prisma.match.findMany({
    where: {
      roundId,
      status: { in: ["LIVE", "FINISHED"] },
      homeScore: { not: null },
      awayScore: { not: null },
    },
    select: { id: true },
  });

  for (const match of matches) {
    await recalculateMatchScoring(match.id);
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

export async function getLeagueMatchPredictions(matchId: string) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      matchTime: true,
      status: true,
      isKnockout: true,
      homeScore: true,
      awayScore: true,
      actualFinishType: true,
      penaltyWinnerTeamId: true,
      homeTeam: {
        select: { id: true, name: true, shortName: true, logoUrl: true },
      },
      awayTeam: {
        select: { id: true, name: true, shortName: true, logoUrl: true },
      },
      penaltyWinnerTeam: { select: { id: true, name: true, shortName: true } },
    },
  });

  if (!match) return null;

  if (isPredictionAllowed(match.matchTime, match.status)) {
    throw new Error("Predictions still open");
  }

  const [predictions, scorerPredictions, boldBets] = await Promise.all([
    prisma.prediction.findMany({
      where: { matchId },
      include: { user: { select: { id: true, username: true } } },
    }),
    prisma.scorerPrediction.findMany({
      where: { matchId },
      include: {
        user: { select: { id: true, username: true } },
        player: { select: { id: true, name: true, teamId: true, position: true } },
      },
    }),
    prisma.boldScorerBet.findMany({
      where: { matchId },
      include: {
        user: { select: { id: true, username: true } },
        player: { select: { id: true, name: true } },
      },
    }),
  ]);

  const rows = new Map<string, LeagueMatchPredictionRow>();

  for (const prediction of predictions) {
    rows.set(prediction.userId, {
      userId: prediction.userId,
      username: prediction.user.username,
      prediction: {
        predHome: prediction.predHome,
        predAway: prediction.predAway,
        isDouble: prediction.isDouble,
        predictedFinishType: prediction.predictedFinishType,
        predictedPenaltyWinnerTeamId: prediction.predictedPenaltyWinnerTeamId,
        points: prediction.points,
        finishTypePoints: prediction.finishTypePoints,
        penaltyWinnerPoints: prediction.penaltyWinnerPoints,
      },
      scorerPredictions: [],
      boldScorerBet: null,
    });
  }

  for (const scorer of scorerPredictions) {
    const existing = rows.get(scorer.userId) ?? {
      userId: scorer.userId,
      username: scorer.user.username,
      prediction: null,
      scorerPredictions: [],
      boldScorerBet: null,
    };
    existing.scorerPredictions.push({
      player: scorer.player,
      predictedGoals: scorer.predictedGoals,
      points: scorer.points,
    });
    rows.set(scorer.userId, existing);
  }

  for (const bold of boldBets) {
    const existing = rows.get(bold.userId) ?? {
      userId: bold.userId,
      username: bold.user.username,
      prediction: null,
      scorerPredictions: [],
      boldScorerBet: null,
    };
    existing.boldScorerBet = {
      player: bold.player,
      points: bold.points,
    };
    rows.set(bold.userId, existing);
  }

  const entries = Array.from(rows.values()).sort((a, b) => {
    if (match.status === "FINISHED") {
      const totalA =
        (a.prediction?.points ?? 0) +
        (a.prediction?.finishTypePoints ?? 0) +
        (a.prediction?.penaltyWinnerPoints ?? 0) +
        a.scorerPredictions.reduce((s, p) => s + (p.points ?? 0), 0) +
        (a.boldScorerBet?.points ?? 0);
      const totalB =
        (b.prediction?.points ?? 0) +
        (b.prediction?.finishTypePoints ?? 0) +
        (b.prediction?.penaltyWinnerPoints ?? 0) +
        b.scorerPredictions.reduce((s, p) => s + (p.points ?? 0), 0) +
        (b.boldScorerBet?.points ?? 0);
      if (totalB !== totalA) return totalB - totalA;
    }
    return a.username.localeCompare(b.username);
  });

  return {
    match: {
      id: matchId,
      matchTime: match.matchTime,
      status: match.status,
      isKnockout: match.isKnockout,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      actualFinishType: match.actualFinishType,
      penaltyWinnerTeamId: match.penaltyWinnerTeamId,
      penaltyWinnerTeam: match.penaltyWinnerTeam,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
    },
    predictions: entries,
  };
}
