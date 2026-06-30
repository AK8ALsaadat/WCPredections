import { randomUUID } from "node:crypto";
import { Prisma, type FinishType } from "@prisma/client";
import { revalidateTag, unstable_cache } from "next/cache";
import { resolveScorerGoalsForPlayer } from "@/lib/player-matching";
import { goalkeeperPositionWhere } from "@/lib/goalkeeper";
import { getTournamentRoundName } from "@/lib/rounds";
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
import { recalculateKnockoutBracketPredictionPoints } from "@/services/knockout-bracket-prediction.service";
import {
  canCombineDoubleAndBoldForUsageScope,
  getMaxDoublesForUsageScope,
  getUsageRoundScope,
} from "@/services/usage-round.service";
import {
  getPredictionMatchMetaCache,
  setPredictionMatchMetaCache,
} from "@/services/prediction-match-cache";
import {
  calculateDoubleBonus,
  calculateFinishTypePoints,
  calculateKnockoutPenaltyWinnerPoints,
  calculatePerfectPredictionBonus,
  calculatePerfectPredictionBonusWithMinute,
  calculateScorePredictionPoints,
  calculateScorerPredictionPoints,
  getScorerGoalsForPoints,
  hasRequiredScorerPicksForPerfectBonus,
  isExactScorePrediction,
  isMatchEligibleForScorerPoints,
  PERFECT_PREDICTION_MIN_MINUTE,
  isMatchFinishedForScoring,
} from "@/services/scoring.service";

export const MAX_DOUBLES_PER_ROUND = 1;

type SavedPredictionRow = {
  id: string;
  predHome: number;
  predAway: number;
  isDouble: boolean;
  predictedFinishType: FinishType | null;
  predictedPenaltyWinnerTeamId: string | null;
};

function assertPenaltyPredictionIsDraw(predHome: number, predAway: number) {
  if (predHome !== predAway) {
    throw new Error("ركلات الترجيح متاحة فقط إذا كانت النتيجة المتوقعة تعادل");
  }
}

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

  const scope = await getUsageRoundScope(matchId);
  const maxDoubles = getMaxDoublesForUsageScope(scope);
  const doublesUsed = await prisma.prediction.count({
    where: {
      userId,
      isDouble: true,
      id: excludePredictionId ? { not: excludePredictionId } : undefined,
      matchId: { in: scope.matchIds },
    },
  });

  if (doublesUsed >= maxDoubles) {
    throw new Error(
      `يمكنك استخدام ${maxDoubles} مضاعفات فقط في كل جولة`
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

  const [existing, usageScope] = await Promise.all([
    prisma.prediction.findUnique({
      where: { userId_matchId: { userId, matchId: data.matchId } },
      select: { id: true, isDouble: true },
    }),
    getUsageRoundScope(data.matchId),
  ]);

  const isDouble = data.isDouble ?? false;

  if (isDouble) {
    const maxDoubles = getMaxDoublesForUsageScope(usageScope);
    const doublesUsed = await prisma.prediction.count({
      where: {
        userId,
        isDouble: true,
        id: existing?.id ? { not: existing.id } : undefined,
        matchId: { in: usageScope.matchIds },
      },
    });
    if (doublesUsed >= maxDoubles) {
      throw new Error(`يمكنك استخدام ${maxDoubles} مضاعفات فقط في كل جولة`);
    }
  }

  if (isDouble) {
    const [boldOnThisMatch, octopusOnThisMatch] = await Promise.all([
      prisma.boldScorerBet.findUnique({
        where: {
          userId_usageRoundKey: {
            userId,
            usageRoundKey: usageScope.key,
          },
        },
        select: { matchId: true },
      }),
      prisma.octopusGoalkeeperBet.findUnique({
        where: {
          userId_usageRoundKey: {
            userId,
            usageRoundKey: usageScope.key,
          },
        },
        select: { matchId: true },
      }),
    ]);
    const allowDoubleWithBold = canCombineDoubleAndBoldForUsageScope(usageScope);
    if (
      octopusOnThisMatch?.matchId === data.matchId ||
      (boldOnThisMatch?.matchId === data.matchId && !allowDoubleWithBold)
    ) {
      throw new Error(
        "ما تقدر تستخدم المضاعفة مع الرهان أو الأخطبوط على نفس المباراة"
      );
    }
  }

  if (match.isKnockout && !data.predictedFinishType) {
    throw new Error("توقع طريقة الإنهاء مطلوب للمباريات الإقصائية");
  }

  if (data.predictedFinishType === "PENALTIES") {
    assertPenaltyPredictionIsDraw(data.predHome, data.predAway);
    if (!data.predictedPenaltyWinnerTeamId) {
      throw new Error("يجب اختيار أحد فريقي المباراة كفائز بركلات الترجيح");
    }
    const validTeams = [match.homeTeamId, match.awayTeamId];
    if (!validTeams.includes(data.predictedPenaltyWinnerTeamId)) {
      throw new Error("يجب اختيار أحد فريقي المباراة كفائز بركلات الترجيح");
    }
  }
  const predictedPenaltyWinnerTeamId =
    data.predictedFinishType === "PENALTIES"
      ? data.predictedPenaltyWinnerTeamId ?? null
      : null;

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
      predictedPenaltyWinnerTeamId,
    },
    update: {
      predHome: data.predHome,
      predAway: data.predAway,
      isDouble,
      predictedFinishType: data.predictedFinishType ?? null,
      predictedPenaltyWinnerTeamId,
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
  if (picks.length === 0) return;

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
  picks: { playerId: string; goals: number }[],
  client: Pick<typeof prisma, "scorerPrediction"> = prisma
) {
  const existing = await client.scorerPrediction.findMany({
    where: { userId, matchId },
    select: { playerId: true, predictedGoals: true },
  });
  const currentKey = existing
    .map((pick) => `${pick.playerId}:${pick.predictedGoals}`)
    .sort()
    .join("|");
  const nextKey = picks
    .map((pick) => `${pick.playerId}:${pick.goals}`)
    .sort()
    .join("|");
  if (currentKey === nextKey) return;

  await client.scorerPrediction.deleteMany({
    where: { userId, matchId },
  });

  if (picks.length === 0) return;

  await client.scorerPrediction.createMany({
    data: picks.map((pick) => ({
        userId,
        matchId,
        playerId: pick.playerId,
        predictedGoals: pick.goals,
        points: 0,
    })),
  });
}

async function savePlainPredictionBundle(
  userId: string,
  data: {
    matchId: string;
    predHome: number;
    predAway: number;
    predictedFinishType?: FinishType | null;
    predictedPenaltyWinnerTeamId?: string | null;
    picks: { playerId: string; goals: number }[];
  }
) {
  const nextScorers =
    data.picks.length > 0
      ? Prisma.sql`VALUES ${Prisma.join(
          data.picks.map(
            (pick) =>
              Prisma.sql`(${randomUUID()}, ${pick.playerId}, ${pick.goals})`
          )
        )}`
      : Prisma.sql`SELECT NULL::text, NULL::text, NULL::integer WHERE FALSE`;

  const rows = await prisma.$queryRaw<SavedPredictionRow[]>(Prisma.sql`
    WITH next_scorers("id", "player_id", "predicted_goals") AS (
      ${nextScorers}
    ),
    upserted AS (
      INSERT INTO "predictions" (
        "id",
        "user_id",
        "match_id",
        "pred_home",
        "pred_away",
        "is_double",
        "predicted_finish_type",
        "predicted_penalty_winner_team_id",
        "created_at",
        "updated_at"
      )
      VALUES (
        ${randomUUID()},
        ${userId},
        ${data.matchId},
        ${data.predHome},
        ${data.predAway},
        false,
        ${data.predictedFinishType ?? null}::"FinishType",
        ${data.predictedPenaltyWinnerTeamId ?? null},
        NOW(),
        NOW()
      )
      ON CONFLICT ("user_id", "match_id") DO UPDATE SET
        "pred_home" = EXCLUDED."pred_home",
        "pred_away" = EXCLUDED."pred_away",
        "is_double" = false,
        "predicted_finish_type" = EXCLUDED."predicted_finish_type",
        "predicted_penalty_winner_team_id" = EXCLUDED."predicted_penalty_winner_team_id",
        "updated_at" = NOW()
      RETURNING
        "id",
        "pred_home" AS "predHome",
        "pred_away" AS "predAway",
        "is_double" AS "isDouble",
        "predicted_finish_type" AS "predictedFinishType",
        "predicted_penalty_winner_team_id" AS "predictedPenaltyWinnerTeamId"
    ),
    deleted_scorers AS (
      DELETE FROM "scorer_predictions" existing
      WHERE existing."user_id" = ${userId}
        AND existing."match_id" = ${data.matchId}
        AND NOT EXISTS (
          SELECT 1
          FROM next_scorers next
          WHERE next."player_id" = existing."player_id"
        )
      RETURNING 1
    ),
    upserted_scorers AS (
      INSERT INTO "scorer_predictions" (
        "id",
        "user_id",
        "match_id",
        "player_id",
        "predicted_goals",
        "points",
        "created_at"
      )
      SELECT
        next."id",
        ${userId},
        ${data.matchId},
        next."player_id",
        next."predicted_goals",
        0,
        NOW()
      FROM next_scorers next
      ON CONFLICT ("user_id", "match_id", "player_id") DO UPDATE SET
        "predicted_goals" = EXCLUDED."predicted_goals",
        "points" = 0
      RETURNING 1
    ),
    deleted_bold AS (
      DELETE FROM "bold_scorer_bets"
      WHERE "user_id" = ${userId}
        AND "match_id" = ${data.matchId}
      RETURNING 1
    ),
    deleted_octopus AS (
      DELETE FROM "octopus_goalkeeper_bets"
      WHERE "user_id" = ${userId}
        AND "match_id" = ${data.matchId}
      RETURNING 1
    )
    SELECT
      "id",
      "predHome",
      "predAway",
      "isDouble",
      "predictedFinishType",
      "predictedPenaltyWinnerTeamId"
    FROM upserted
  `);

  const prediction = rows[0];
  if (!prediction) {
    throw new Error("Prediction could not be saved");
  }
  return prediction;
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

  try {
    revalidateTag(`matches-user-${userId}`);
    revalidateTag(`match-${matchId}`);
  } catch {
    // Background/test contexts may not have a Next cache store.
  }

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
  let match = getPredictionMatchMetaCache(data.matchId);
  if (!match) {
    match = await prisma.match.findUniqueOrThrow({
      where: { id: data.matchId },
      select: {
        id: true,
        roundId: true,
        homeTeamId: true,
        awayTeamId: true,
        matchTime: true,
        status: true,
        isKnockout: true,
        homeTeam: { select: { shortName: true } },
        awayTeam: { select: { shortName: true } },
      },
    });
    setPredictionMatchMetaCache(match);
  }

  const lockReason = getPredictionLockReason(match.matchTime, match.status);
  if (lockReason) {
    throw new Error(lockReason);
  }

  const isDouble = data.isDouble ?? false;
  let predHome = data.predHome;
  let predAway = data.predAway;
  let picks = data.picks.map((pick) => ({ ...pick }));
  let boldPlayer: { id: string; teamId: string } | null = null;
  let octopusPlayer: { id: string; teamId: string } | null = null;

  if (match.isKnockout && !data.predictedFinishType) {
    throw new Error("توقع طريقة الإنهاء مطلوب للمباريات الإقصائية");
  }

  if (data.predictedFinishType === "PENALTIES") {
    assertPenaltyPredictionIsDraw(data.predHome, data.predAway);
    if (!data.predictedPenaltyWinnerTeamId) {
      throw new Error("يجب اختيار أحد فريقي المباراة كفائز بركلات الترجيح");
    }
    const validTeams = [match.homeTeamId, match.awayTeamId];
    if (!validTeams.includes(data.predictedPenaltyWinnerTeamId)) {
      throw new Error("يجب اختيار أحد فريقي المباراة كفائز بركلات الترجيح");
    }
  }
  const predictedPenaltyWinnerTeamId =
    data.predictedFinishType === "PENALTIES"
      ? data.predictedPenaltyWinnerTeamId ?? null
      : null;

  if (!isDouble && !data.boldPlayerId && !data.octopusPlayerId) {
    await validateScorerPicks(match, predHome, predAway, picks);

    const prediction = await savePlainPredictionBundle(userId, {
      matchId: data.matchId,
      predHome,
      predAway,
      predictedFinishType: data.predictedFinishType ?? null,
      predictedPenaltyWinnerTeamId,
      picks,
    });

    const result = {
      prediction,
      scorerPredictions: picks.map((pick) => ({
        playerId: pick.playerId,
        predictedGoals: pick.goals,
      })),
      scorers: picks.length,
      boldBet: null,
      octopusBet: null,
    };

    try {
      revalidateTag(`match-${data.matchId}`);
      revalidateTag("matches-schedule");
      revalidateTag(`matches-user-${userId}`);
    } catch {
      // Background/test contexts may not have a Next cache store.
    }

    return result;
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
          "لازم لاعب الرهان يكون من الهدافين اللي اخترتهم في نفس التوقع"
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

  const [existing, usageScope] = await Promise.all([
    prisma.prediction.findUnique({
      where: { userId_matchId: { userId, matchId: data.matchId } },
      select: { id: true, isDouble: true },
    }),
    getUsageRoundScope(data.matchId, match.roundId),
  ]);

  if (isDouble) {
    const maxDoubles = getMaxDoublesForUsageScope(usageScope);
    const doublesUsed = await prisma.prediction.count({
      where: {
        userId,
        isDouble: true,
        id: existing?.id ? { not: existing.id } : undefined,
        matchId: { in: usageScope.matchIds },
      },
    });
    if (doublesUsed >= maxDoubles) {
      throw new Error(
        `يمكنك استخدام ${maxDoubles} مضاعفات فقط في كل جولة`
      );
    }
  }

  let [storedBold, storedOctopus] = await Promise.all([
    prisma.boldScorerBet.findUnique({
      where: {
        userId_usageRoundKey: {
          userId,
          usageRoundKey: usageScope.key,
        },
      },
    }),
    prisma.octopusGoalkeeperBet.findUnique({
      where: {
        userId_usageRoundKey: {
          userId,
          usageRoundKey: usageScope.key,
        },
      },
    }),
  ]);

  if (!storedBold) {
    const sameMatchBold = await prisma.boldScorerBet.findFirst({
      where: { userId, matchId: data.matchId, cancelledAt: null },
    });
    if (sameMatchBold) {
      storedBold =
        sameMatchBold.usageRoundKey === usageScope.key
          ? sameMatchBold
          : await prisma.boldScorerBet
              .update({
                where: { id: sameMatchBold.id },
                data: { usageRoundKey: usageScope.key },
              })
              .catch(() => sameMatchBold);
    }
  }

  if (!storedOctopus) {
    const sameMatchOctopus = await prisma.octopusGoalkeeperBet.findFirst({
      where: { userId, matchId: data.matchId, cancelledAt: null },
    });
    if (sameMatchOctopus) {
      storedOctopus =
        sameMatchOctopus.usageRoundKey === usageScope.key
          ? sameMatchOctopus
          : await prisma.octopusGoalkeeperBet
              .update({
                where: { id: sameMatchOctopus.id },
                data: { usageRoundKey: usageScope.key },
              })
              .catch(() => sameMatchOctopus);
    }
  }

  const storedBoldActiveOnThisMatch =
    storedBold != null &&
    storedBold.cancelledAt == null &&
    storedBold.matchId === data.matchId;
  const storedOctopusActiveOnThisMatch =
    storedOctopus != null &&
    storedOctopus.cancelledAt == null &&
    storedOctopus.matchId === data.matchId;
  const nextBoldActiveOnThisMatch = Boolean(data.boldPlayerId);
  const nextOctopusActiveOnThisMatch = Boolean(data.octopusPlayerId);
  const allowDoubleWithBold = canCombineDoubleAndBoldForUsageScope(usageScope);

  if (
    isDouble &&
    (nextOctopusActiveOnThisMatch ||
      (nextBoldActiveOnThisMatch && !allowDoubleWithBold))
  ) {
    throw new Error(
      "ما تقدر تستخدم المضاعفة مع الرهان أو الأخطبوط على نفس المباراة"
    );
  }

  if (nextBoldActiveOnThisMatch && nextOctopusActiveOnThisMatch) {
    throw new Error("ما تقدر تستخدم الرهان والأخطبوط معاً على نفس المباراة");
  }

  if (nextOctopusActiveOnThisMatch && nextBoldActiveOnThisMatch) {
    throw new Error("ما تقدر تستخدم الأخطبوط مع الرهان على نفس المباراة");
  }

  if (
    data.boldPlayerId &&
    storedBold != null &&
    storedBold.cancelledAt == null &&
    storedBold.matchId !== data.matchId
  ) {
    throw new Error(
      "استخدمت الرهان في مباراة ثانية هالجولة — مرة واحدة بس"
    );
  }

  if (
    data.octopusPlayerId &&
    storedOctopus != null &&
    storedOctopus.cancelledAt == null &&
    storedOctopus.matchId !== data.matchId
  ) {
    throw new Error("استخدمت الأخطبوط في مباراة ثانية هالجولة — مرة واحدة بس");
  }

  const storedBoldOnThisMatchId = storedBoldActiveOnThisMatch
    ? storedBold?.id ?? null
    : null;
  const storedOctopusOnThisMatchId = storedOctopusActiveOnThisMatch
    ? storedOctopus?.id ?? null
    : null;

  const result = await prisma.$transaction(async (tx) => {
    if (storedBoldOnThisMatchId && !data.boldPlayerId) {
      await tx.boldScorerBet.delete({ where: { id: storedBoldOnThisMatchId } });
    }
    if (storedOctopusOnThisMatchId && !data.octopusPlayerId) {
      await tx.octopusGoalkeeperBet.delete({
        where: { id: storedOctopusOnThisMatchId },
      });
    }

    const prediction = await tx.prediction.upsert({
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
        predictedPenaltyWinnerTeamId,
      },
      update: {
        predHome,
        predAway,
        isDouble,
        predictedFinishType: data.predictedFinishType ?? null,
        predictedPenaltyWinnerTeamId,
      },
      select: {
        id: true,
        predHome: true,
        predAway: true,
        isDouble: true,
        predictedFinishType: true,
        predictedPenaltyWinnerTeamId: true,
      },
    });

    await replaceScorerPredictions(userId, data.matchId, picks, tx);

    const boldBet = data.boldPlayerId
      ? await tx.boldScorerBet.upsert({
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
            cancelledAt: null,
          },
          include: {
            player: { select: { id: true, name: true } },
          },
        })
      : null;

    const octopusBet = data.octopusPlayerId
      ? await tx.octopusGoalkeeperBet.upsert({
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
            cancelledAt: null,
          },
          include: {
            player: { select: { id: true, name: true } },
          },
        })
      : null;

    return {
      prediction,
      scorerPredictions: picks.map((pick) => ({
        playerId: pick.playerId,
        predictedGoals: pick.goals,
      })),
      scorers: picks.length,
      boldBet,
      octopusBet,
    };
  });

  try {
    revalidateTag(`match-${data.matchId}`);
    revalidateTag("matches-schedule");
    revalidateTag(`matches-user-${userId}`);
  } catch {
    // Background/test contexts may not have a Next cache store.
  }

  return result;
}

type ScorerPredictionWithPlayer = {
  id: string;
  userId: string;
  playerId: string;
  predictedGoals: number;
  player: {
    name: string;
    teamId: string;
    position?: string | null;
    team?: { name?: string | null } | null;
  };
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
      player: {
        teamId: string;
        name: string;
        team?: { name?: string | null } | null;
      };
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
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
      matchScorers: {
        include: {
          player: {
            select: {
              teamId: true,
              name: true,
              team: { select: { name: true } },
            },
          },
        },
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
          homeTeamName: match.homeTeam.name,
          awayTeamName: match.awayTeam.name,
          homeScore: match.homeScore!,
          awayScore: match.awayScore!,
        },
        match.matchScorers
      )
    : null;

  const scorerPredictions = canScoreScorers
    ? await prisma.scorerPrediction.findMany({
        where: { matchId },
        include: {
          player: {
            select: {
              name: true,
              teamId: true,
              position: true,
              team: { select: { name: true } },
            },
          },
        },
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
          false,
          {
            homeTeamId: match.homeTeamId,
            awayTeamId: match.awayTeamId,
            predictedFinishType: prediction.predictedFinishType,
            predictedPenaltyWinnerTeamId:
              prediction.predictedPenaltyWinnerTeamId,
            actualFinishType: match.actualFinishType,
            actualPenaltyWinnerTeamId: match.penaltyWinnerTeamId,
          }
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
      const finishTypeCorrectForPerfect =
        !match.isKnockout ||
        Boolean(
          match.actualFinishType &&
            prediction.predictedFinishType === match.actualFinishType
        );
      const picks = picksByUser.get(prediction.userId) ?? [];
      
      // استخدم الدالة الجديدة التي تتحقق من الدقيقة 75
      bonusPoints = hasRequiredScorerPicksForPerfectBonus(
        prediction.predHome,
        prediction.predAway,
        picks.length
      )
        ? calculatePerfectPredictionBonusWithMinute(
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
            { finishTypeCorrect: finishTypeCorrectForPerfect }
          )
        : 0;
    }

    const finishTypePoints = (shouldAwardBasePoints && match.isKnockout)
      ? calculateFinishTypePoints(
          prediction.predictedFinishType,
          match.actualFinishType
        )
      : 0;

    const penaltyWinnerPoints =
      shouldAwardBasePoints && match.isKnockout && match.actualFinishType === "PENALTIES"
        ? calculateKnockoutPenaltyWinnerPoints(
            prediction.predictedFinishType,
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
  if (match.isKnockout) {
    await recalculateKnockoutBracketPredictionPoints();
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
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    select: { name: true },
  });
  const roundIds =
    round?.name === getTournamentRoundName()
      ? (
          await prisma.round.findMany({
            select: { id: true },
          })
        ).map((item) => item.id)
      : [roundId];

  const matches = await prisma.match.findMany({
    where: {
      roundId: { in: roundIds },
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
            goalkeeperStats: {
              select: { playerId: true, saves: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const isVisibleAfterDeadline = (item: {
    match: { matchTime: Date; status: string };
  }) =>
    item.match.status !== "SCHEDULED" ||
    !isPredictionAllowed(item.match.matchTime, item.match.status);

  return {
    predictions: predictions.filter(isVisibleAfterDeadline),
    scorerPredictions: scorerPredictions.filter(isVisibleAfterDeadline),
    boldScorerBets: boldScorerBets.filter(isVisibleAfterDeadline),
    octopusBets: octopusBets.filter(isVisibleAfterDeadline),
  };
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

  // Exclude QA/test/demo accounts from match-level predictions shown to users
  const nonQaUserFilter: Record<string, unknown> = {
    user: {
      NOT: [
        { username: { startsWith: "qa_" } },
        { username: { startsWith: "ui_qa_" } },
        { username: { startsWith: "test" } },
        { username: { contains: "tester", mode: "insensitive" } },
        { username: { startsWith: "demo" } },
        { username: { startsWith: "sample" } },
        { username: { contains: "_test", mode: "insensitive" } },
      ],
    },
  };

  const [predictions, scorerPredictions, boldBets, octopusBets, goalkeeperStats] =
    await Promise.all([
      prisma.prediction.findMany({
        where: { matchId, ...nonQaUserFilter },
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
        where: { matchId, ...nonQaUserFilter },
        select: {
          userId: true,
          predictedGoals: true,
          points: true,
          user: { select: { username: true } },
          player: { select: { id: true, name: true, teamId: true, position: true } },
        },
      }),
      prisma.boldScorerBet.findMany({
        where: { matchId, ...nonQaUserFilter },
        select: {
          userId: true,
          points: true,
          user: { select: { username: true } },
          player: { select: { id: true, name: true } },
        },
      }),
      prisma.octopusGoalkeeperBet.findMany({
        where: { matchId, ...nonQaUserFilter },
        select: {
          userId: true,
          points: true,
          playerId: true,
          user: { select: { username: true } },
          player: { select: { id: true, name: true, teamId: true } },
        },
      }),
      prisma.matchGoalkeeperStat.findMany({
        where: { matchId },
        select: { playerId: true, saves: true },
      }),
    ]);

  const rows = new Map<string, LeagueMatchPredictionRow>();
  const goalkeeperSavesByPlayer = new Map(
    goalkeeperStats.map((stat) => [stat.playerId, stat.saves])
  );
  const goalsConcededByTeam = new Map<string, number | null>([
    [match.homeTeam.id, match.awayScore],
    [match.awayTeam.id, match.homeScore],
  ]);

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
      player: { id: octopus.player.id, name: octopus.player.name },
      points: octopus.points,
      saves: goalkeeperSavesByPlayer.get(octopus.playerId) ?? null,
      goalsConceded: goalsConcededByTeam.get(octopus.player.teamId) ?? null,
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
