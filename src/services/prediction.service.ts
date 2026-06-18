import type { FinishType } from "@prisma/client";
import { revalidateTag, unstable_cache } from "next/cache";
import { resolveScorerGoalsForPlayer } from "@/lib/player-matching";
import { goalkeeperPositionWhere } from "@/lib/goalkeeper";
import { prisma } from "@/lib/prisma";
import { getPredictionLockReason, isPredictionAllowed } from "@/lib/utils";
import {
  MAX_PREDICTED_SCORER_GOALS_PER_TEAM,
  MAX_SCORERS_PER_TEAM,
  MAX_SCORERS_TOTAL,
  scorerGoalTarget,
} from "@/lib/scorer-prediction";
import type { LeagueMatchPredictionRow } from "@/types";
import {
  calculateBoldScorerBetPointsForMatch,
  getBoldScorerBetEligibility,
} from "@/services/bold-scorer-bet.service";
import { calculateOctopusPointsForMatch } from "@/services/octopus-bet.service";
import { getUsageRoundScope } from "@/services/usage-round.service";
import {
  calculateDoubleBonus,
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

export function shouldIgnorePositionMultiplierForScorerPrediction(
  scorerPredictionId: string
): boolean {
  void scorerPredictionId;
  return false;
}

export async function countDoublesUsedInRound(
  userId: string,
  matchId: string,
  excludePredictionId?: string
): Promise<number> {
  const scope = await getUsageRoundScope(matchId);
  return prisma.prediction.count({
    where: {
      userId,
      isDouble: true,
      id: excludePredictionId ? { not: excludePredictionId } : undefined,
      matchId: { in: scope.matchIds },
    },
  });
}

export async function validateDoubleUsage(
  userId: string,
  matchId: string,
  isDouble: boolean,
  excludePredictionId?: string
): Promise<void> {
  if (!isDouble) return;

  const doublesUsed = await countDoublesUsedInRound(
    userId,
    matchId,
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

  await validateDoubleUsage(
    userId,
    data.matchId,
    isDouble,
    existing?.id
  );

  if (isDouble) {
    const scope = await getUsageRoundScope(data.matchId, match.roundId);
    const [boldOnThisMatch, octopusOnThisMatch] = await Promise.all([
      prisma.boldScorerBet.findUnique({
        where: {
          userId_usageRoundKey: {
            userId,
            usageRoundKey: scope.key,
          },
        },
        select: { matchId: true },
      }),
      prisma.octopusGoalkeeperBet.findUnique({
        where: {
          userId_usageRoundKey: {
            userId,
            usageRoundKey: scope.key,
          },
        },
        select: { matchId: true },
      }),
    ]);
    if (
      boldOnThisMatch?.matchId === data.matchId ||
      octopusOnThisMatch?.matchId === data.matchId
    ) {
      throw new Error(
        "ما تقدر تستخدم المضاعفة والرهان معاً على نفس المباراة"
      );
    }
  }

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
  const uniquePlayerIds = [...new Set(playerIds)];
  if (uniquePlayerIds.length !== playerIds.length) {
    throw new Error("اختيار لاعب مكرر");
  }
  const players =
    uniquePlayerIds.length === 0
      ? []
      : await prisma.player.findMany({
          where: {
            id: { in: uniquePlayerIds },
            teamId: { in: [match.homeTeamId, match.awayTeamId] },
          },
        });

  if (players.length !== uniquePlayerIds.length) {
    throw new Error("اختيار لاعب غير صالح");
  }

  const playersById = new Map(players.map((player) => [player.id, player]));
  let homeGoals = 0;
  let awayGoals = 0;
  let homeScorers = 0;
  let awayScorers = 0;
  for (const pick of picks) {
    const player = playersById.get(pick.playerId);
    if (!player) continue;
    if (player.teamId === match.homeTeamId) {
      homeGoals += pick.goals;
      homeScorers++;
    } else {
      awayGoals += pick.goals;
      awayScorers++;
    }
  }
  const homeTarget = scorerGoalTarget(predHome);
  const awayTarget = scorerGoalTarget(predAway);

  if (homeScorers > homeTarget) {
    throw new Error(
      `عدد هدافي ${match.homeTeam.shortName} (${homeScorers}) زاد عن الحد (${homeTarget})`
    );
  }
  if (awayScorers > awayTarget) {
    throw new Error(
      `عدد هدافي ${match.awayTeam.shortName} (${awayScorers}) زاد عن الحد (${awayTarget})`
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

  if (homeGoals > homeTarget) {
    throw new Error(
      `أهداف هدافي ${match.homeTeam.shortName} (${homeGoals}) زادت عن الحد ${MAX_PREDICTED_SCORER_GOALS_PER_TEAM}`
    );
  }
  if (awayGoals > awayTarget) {
    throw new Error(
      `أهداف هدافي ${match.awayTeam.shortName} (${awayGoals}) زادت عن الحد ${MAX_PREDICTED_SCORER_GOALS_PER_TEAM}`
    );
  }

  if (homeTarget > 0 && homeGoals !== homeTarget) {
    throw new Error(
      `لازم توزّع ${homeTarget} ${homeTarget === 1 ? "هدف" : "أهداف"} على هدافي ${match.homeTeam.shortName} (حالياً ${homeGoals})`
    );
  }
  if (awayTarget > 0 && awayGoals !== awayTarget) {
    throw new Error(
      `لازم توزّع ${awayTarget} ${awayTarget === 1 ? "هدف" : "أهداف"} على هدافي ${match.awayTeam.shortName} (حالياً ${awayGoals})`
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
  await prisma.scorerPrediction.deleteMany({
    where: { userId, matchId },
  });

  if (picks.length === 0) return;

  await prisma.scorerPrediction.createMany({
    data: picks.map((pick) => ({
        userId,
        matchId,
        playerId: pick.playerId,
        predictedGoals: pick.goals,
        points: 0,
    })),
  });
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
    octopusPlayerId?: string | null;
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
  let predHome = data.predHome;
  let predAway = data.predAway;
  let picks = data.picks.map((pick) => ({ ...pick }));
  let boldPlayer: { id: string; teamId: string } | null = null;
  let octopusPlayer: { id: string; teamId: string } | null = null;

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

  if (data.boldPlayerId) {
    const eligibility = await getBoldScorerBetEligibility(userId);
    if (!eligibility.hasMinimumPoints) {
      throw new Error(
        `تحتاج ${eligibility.minimumPoints} نقاط على الأقل لاستخدام الرهان`
      );
    }

    boldPlayer = await prisma.player.findFirst({
      where: {
        id: data.boldPlayerId,
        teamId: { in: [match.homeTeamId, match.awayTeamId] },
      },
      select: { id: true, teamId: true },
    });
    if (!boldPlayer) {
      throw new Error("اختيار لاعب غير صالح للبطاقة الجريئة");
    }
  }

  if (data.boldPlayerId) {
    const boldAlreadyPicked = picks.some(
      (pick) => pick.playerId === data.boldPlayerId
    );
    if (!boldAlreadyPicked) {
      if (boldPlayer && picks.length === 0 && predHome === 0 && predAway === 0) {
        if (boldPlayer.teamId === match.homeTeamId) {
          predHome = 1;
        } else {
          predAway = 1;
        }
        picks = [{ playerId: data.boldPlayerId, goals: 1 }];
      } else {
        throw new Error(
          "Ù„Ø§Ø²Ù… Ù„Ø§Ø¹Ø¨ Ø§Ù„Ø±Ù‡Ø§Ù† ÙŠÙƒÙˆÙ† Ù…Ù† Ø§Ù„Ù‡Ø¯Ø§ÙÙŠÙ† Ø§Ù„Ù„ÙŠ Ø§Ø®ØªØ±ØªÙ‡Ù… ÙÙŠ Ù†ÙØ³ Ø§Ù„ØªÙˆÙ‚Ø¹"
        );
      }
    }
  }

  if (data.octopusPlayerId) {
    octopusPlayer = await prisma.player.findFirst({
      where: {
        id: data.octopusPlayerId,
        teamId: { in: [match.homeTeamId, match.awayTeamId] },
        ...goalkeeperPositionWhere,
      },
      select: { id: true, teamId: true },
    });
    if (!octopusPlayer) {
      throw new Error("اختيار الحارس غير صالح للأخطبوط");
    }
  }

  await validateScorerPicks(match, predHome, predAway, picks);

  const usageScope = await getUsageRoundScope(data.matchId);

  if (isDouble) {
    const doublesUsed = await prisma.prediction.count({
      where: {
        userId,
        isDouble: true,
        id: existing?.id ? { not: existing.id } : undefined,
        matchId: { in: usageScope.matchIds },
      },
    });
    if (doublesUsed >= MAX_DOUBLES_PER_ROUND) {
      throw new Error(
        `يمكنك استخدام ${MAX_DOUBLES_PER_ROUND} مضاعفات فقط في كل جولة`
      );
    }
  }

  const storedBold = await prisma.boldScorerBet.findUnique({
    where: {
      userId_usageRoundKey: {
        userId,
        usageRoundKey: usageScope.key,
      },
    },
  });

  const storedOctopus = await prisma.octopusGoalkeeperBet.findUnique({
    where: {
      userId_usageRoundKey: {
        userId,
        usageRoundKey: usageScope.key,
      },
    },
  });

  // ✅ منع استخدام الـ Double والـ Bold معاً على نفس المباراة
  if (
    isDouble &&
    (data.boldPlayerId ||
      data.octopusPlayerId ||
      storedBold?.matchId === data.matchId ||
      storedOctopus?.matchId === data.matchId)
  ) {
    throw new Error(
      "ما تقدر تستخدم المضاعفة والرهان معاً على نفس المباراة"
    );
  }

  if (
    data.boldPlayerId &&
    (data.octopusPlayerId || storedOctopus?.matchId === data.matchId)
  ) {
    throw new Error("ما تقدر تستخدم الرهان والأخطبوط معاً على نفس المباراة");
  }

  if (
    data.octopusPlayerId &&
    (data.boldPlayerId || storedBold?.matchId === data.matchId)
  ) {
    throw new Error("ما تقدر تستخدم الأخطبوط مع الرهان على نفس المباراة");
  }

  if (storedBold?.matchId === data.matchId) {
    if (!data.boldPlayerId) {
      // cancellation: remove the stored bold bet for this user/round
      await prisma.boldScorerBet.delete({ where: { id: storedBold.id } });
    }
  } else if (
    data.boldPlayerId &&
    storedBold &&
    storedBold.matchId !== data.matchId
  ) {
    throw new Error(
      "استخدمت الرهان في مباراة ثانية هالجولة — مرة واحدة بس"
    );
  }

  if (storedOctopus?.matchId === data.matchId) {
    if (!data.octopusPlayerId) {
      await prisma.octopusGoalkeeperBet.delete({
        where: { id: storedOctopus.id },
      });
    }
  } else if (
    data.octopusPlayerId &&
    storedOctopus &&
    storedOctopus.matchId !== data.matchId
  ) {
    throw new Error("استخدمت الأخطبوط في مباراة ثانية هالجولة — مرة واحدة بس");
  }

  const prediction = await prisma.prediction.upsert({
    where: {
      userId_matchId: { userId, matchId: data.matchId },
    },
    create: {
      userId,
      matchId: data.matchId,
      predHome,
      predAway,
      isDouble,
      predictedFinishType: data.predictedFinishType ?? null,
      predictedPenaltyWinnerTeamId:
        data.predictedPenaltyWinnerTeamId ?? null,
    },
    update: {
      predHome,
      predAway,
      isDouble,
      predictedFinishType: data.predictedFinishType ?? null,
      predictedPenaltyWinnerTeamId:
        data.predictedPenaltyWinnerTeamId ?? null,
    },
    select: { id: true },
  });

  await replaceScorerPredictions(userId, data.matchId, picks);

  let boldBet = null;
  if (data.boldPlayerId) {
    boldBet = await prisma.boldScorerBet.upsert({
      where: {
        userId_usageRoundKey: {
          userId,
          usageRoundKey: usageScope.key,
        },
      },
      create: {
        userId,
        roundId: match.roundId,
        usageRoundKey: usageScope.key,
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

  let octopusBet = null;
  if (data.octopusPlayerId) {
    octopusBet = await prisma.octopusGoalkeeperBet.upsert({
      where: {
        userId_usageRoundKey: {
          userId,
          usageRoundKey: usageScope.key,
        },
      },
      create: {
        userId,
        roundId: match.roundId,
        usageRoundKey: usageScope.key,
        matchId: data.matchId,
        playerId: data.octopusPlayerId,
      },
      update: {
        matchId: data.matchId,
        playerId: data.octopusPlayerId,
        points: 0,
      },
      include: {
        player: { select: { id: true, name: true } },
      },
    });
  }

  return { prediction, scorers: picks.length, boldBet, octopusBet };
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
): Promise<Map<string, number>> {
  const pointsByUser = new Map<string, number>();

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
      sp.player.position as Parameters<typeof calculateScorerPredictionPoints>[2],
      {
        ignorePositionMultiplier:
          shouldIgnorePositionMultiplierForScorerPrediction(sp.id),
      }
    );
    await prisma.scorerPrediction.update({
      where: { id: sp.id },
      data: { points },
    });
    pointsByUser.set(
      sp.userId,
      (pointsByUser.get(sp.userId) ?? 0) + points
    );
  }

  await calculateBoldScorerBetPointsForMatch(
    match.id,
    scorerGoalsByPlayer,
    match.matchScorers
  );

  return pointsByUser;
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

  const scorerPointsByUser =
    canScoreScorers && scorerGoalsByPlayer
      ? await applyScorerAndBoldPoints(
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
          scorerPredictions
        )
      : new Map<string, number>();

  const minutesElapsed = (Date.now() - new Date(match.matchTime).getTime()) / (1000 * 60);
  const shouldAwardBasePoints = finished || minutesElapsed >= PERFECT_PREDICTION_MIN_MINUTE;

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
    const scorePoints = shouldAwardBasePoints
      ? calculateScorePredictionPoints(
          prediction.predHome,
          prediction.predAway,
          match.homeScore!,
          match.awayScore!,
          false
        )
      : 0;

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
        match.status
      );
    }

    const finishTypePoints = (shouldAwardBasePoints && match.isKnockout)
      ? calculateFinishTypePoints(
          prediction.predictedFinishType,
          match.actualFinishType
        )
      : 0;

    const penaltyWinnerPoints =
      (shouldAwardBasePoints && match.isKnockout && match.actualFinishType === "PENALTIES")
        ? calculatePenaltyWinnerPoints(
            prediction.predictedPenaltyWinnerTeamId,
            match.penaltyWinnerTeamId
          )
        : 0;

    const baseMatchPoints =
      scorePoints +
      bonusPoints +
      finishTypePoints +
      penaltyWinnerPoints +
      (scorerPointsByUser.get(prediction.userId) ?? 0);

    await prisma.prediction.update({
      where: { id: prediction.id },
      data: {
        points: scorePoints + bonusPoints,
        doubleBonus: calculateDoubleBonus(
          prediction.isDouble,
          baseMatchPoints
        ),
        finishTypePoints,
        penaltyWinnerPoints,
      },
    });
  }

  await calculateOctopusPointsForMatch(matchId);

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
  const [predictions, scorerPredictions, boldScorerBets, octopusBets] = await Promise.all([
    prisma.prediction.findMany({
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
    }),
    prisma.scorerPrediction.findMany({
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
    }),
    prisma.boldScorerBet.findMany({
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
    }),
    prisma.octopusGoalkeeperBet.findMany({
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
    }),
  ]);

  return { predictions, scorerPredictions, boldScorerBets, octopusBets };
}

async function fetchLeagueMatchPredictions(matchId: string) {
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

  const [predictions, scorerPredictions, boldBets, octopusBets] =
    await Promise.all([
    prisma.prediction.findMany({
      where: { matchId },
      select: {
        userId: true,
        predHome: true,
        predAway: true,
        isDouble: true,
        predictedFinishType: true,
        predictedPenaltyWinnerTeamId: true,
        points: true,
        doubleBonus: true,
        finishTypePoints: true,
        penaltyWinnerPoints: true,
        user: { select: { username: true } },
      },
    }),
    prisma.scorerPrediction.findMany({
      where: { matchId },
      select: {
        userId: true,
        predictedGoals: true,
        points: true,
        user: { select: { username: true } },
        player: { select: { id: true, name: true, teamId: true, position: true } },
      },
    }),
      prisma.boldScorerBet.findMany({
        where: { matchId },
        select: {
          userId: true,
          points: true,
          user: { select: { username: true } },
          player: { select: { id: true, name: true } },
        },
      }),
      prisma.octopusGoalkeeperBet.findMany({
        where: { matchId },
        select: {
          userId: true,
          points: true,
          user: { select: { username: true } },
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
        doubleBonus: prediction.doubleBonus,
        finishTypePoints: prediction.finishTypePoints,
        penaltyWinnerPoints: prediction.penaltyWinnerPoints,
      },
      scorerPredictions: [],
      boldScorerBet: null,
      octopusGoalkeeperBet: null,
    });
  }

  for (const scorer of scorerPredictions) {
    const existing = rows.get(scorer.userId) ?? {
      userId: scorer.userId,
      username: scorer.user.username,
      prediction: null,
      scorerPredictions: [],
      boldScorerBet: null,
      octopusGoalkeeperBet: null,
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
      octopusGoalkeeperBet: null,
    };
    existing.boldScorerBet = {
      player: bold.player,
      points: bold.points,
    };
    rows.set(bold.userId, existing);
  }

  for (const octopus of octopusBets) {
    const existing = rows.get(octopus.userId) ?? {
      userId: octopus.userId,
      username: octopus.user.username,
      prediction: null,
      scorerPredictions: [],
      boldScorerBet: null,
      octopusGoalkeeperBet: null,
    };
    existing.octopusGoalkeeperBet = {
      player: octopus.player,
      points: octopus.points,
    };
    rows.set(octopus.userId, existing);
  }

  const entries = Array.from(rows.values()).sort((a, b) => {
    if (match.status === "LIVE" || match.status === "FINISHED") {
      const totalA =
        (a.prediction?.points ?? 0) +
        (a.prediction?.doubleBonus ?? 0) +
        (a.prediction?.finishTypePoints ?? 0) +
        (a.prediction?.penaltyWinnerPoints ?? 0) +
        a.scorerPredictions.reduce((s, p) => s + (p.points ?? 0), 0) +
        (a.boldScorerBet?.points ?? 0) +
        (a.octopusGoalkeeperBet?.points ?? 0);
      const totalB =
        (b.prediction?.points ?? 0) +
        (b.prediction?.doubleBonus ?? 0) +
        (b.prediction?.finishTypePoints ?? 0) +
        (b.prediction?.penaltyWinnerPoints ?? 0) +
        b.scorerPredictions.reduce((s, p) => s + (p.points ?? 0), 0) +
        (b.boldScorerBet?.points ?? 0) +
        (b.octopusGoalkeeperBet?.points ?? 0);
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

export async function getLeagueMatchPredictions(matchId: string) {
  return unstable_cache(
    () => fetchLeagueMatchPredictions(matchId),
    ["league-match-predictions-v1", matchId],
    {
      revalidate: 30,
      tags: [`match-${matchId}`],
    }
  )();
}
