import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { unstable_cache } from "next/cache";
import { applyOverallLeaderboardBaseline } from "@/services/baseline-points.service";
import {
  canCombineDoubleAndBoldForUsageScope,
  getMaxDoublesForUsageScope,
  getUsageRoundScope,
  getUsageRoundPhase,
  isHighValueBoldScorerRound,
} from "@/services/usage-round.service";
import { MIN_POINTS_FOR_BOLD_SCORER_BET } from "@/services/user-points.service";

export const MAX_BOLD_SCORER_BETS_PER_ROUND = 1;
export { MIN_POINTS_FOR_BOLD_SCORER_BET } from "@/services/user-points.service";

const ROUND_USAGE_LIMITS_CACHE_SECONDS = 15;

type RoundUsageRow = {
  username: string;
  rawPoints: number | bigint | string;
  doublesInRound: number | bigint | string;
  doubleOnThisMatch: boolean;
  boldMatchId: string | null;
  boldPlayerId: string | null;
  boldPlayerName: string | null;
  boldPoints: number | null;
  octopusMatchId: string | null;
  octopusPlayerId: string | null;
  octopusPlayerName: string | null;
  octopusPoints: number | null;
};

function isMissingNextIncrementalCache(error: unknown) {
  return (
    error instanceof Error &&
    error.message.includes("incrementalCache missing")
  );
}

async function buildRoundUsageLimits(
  userId: string,
  matchId: string,
  roundId?: string
) {
  const scope = await getUsageRoundScope(matchId, roundId);
  const resolvedRoundId = roundId ?? scope.databaseRoundId;

  const usageRows = await prisma.$queryRaw<RoundUsageRow[]>(Prisma.sql`
    SELECT
      "users"."username",
      (
        COALESCE((
          SELECT SUM(
            "points" +
            "double_bonus" +
            "finish_type_points" +
            "penalty_winner_points"
          )
          FROM "predictions"
          WHERE "user_id" = "users"."id"
        ), 0) +
        COALESCE((
          SELECT SUM("points")
          FROM "scorer_predictions"
          WHERE "user_id" = "users"."id"
        ), 0) +
        COALESCE((
          SELECT SUM("points")
          FROM "bold_scorer_bets"
          WHERE "user_id" = "users"."id"
            AND "cancelled_at" IS NULL
        ), 0) +
        COALESCE((
          SELECT SUM("points")
          FROM "octopus_goalkeeper_bets"
          WHERE "user_id" = "users"."id"
            AND "cancelled_at" IS NULL
        ), 0) +
        COALESCE((
          SELECT
            "finalist_one_points" +
            "finalist_two_points" +
            "champion_points"
          FROM "knockout_bracket_predictions"
          WHERE "user_id" = "users"."id"
        ), 0)
      )::int AS "rawPoints",
      COALESCE((
        SELECT COUNT(*)::int
        FROM "predictions"
        WHERE "user_id" = "users"."id"
          AND "match_id" IN (${Prisma.join(scope.matchIds)})
          AND "is_double" = true
      ), 0)::int AS "doublesInRound",
      COALESCE((
        SELECT "is_double"
        FROM "predictions"
        WHERE "user_id" = "users"."id"
          AND "match_id" = ${matchId}
        LIMIT 1
      ), false) AS "doubleOnThisMatch",
      bold."match_id" AS "boldMatchId",
      bold."player_id" AS "boldPlayerId",
      bold_player."name" AS "boldPlayerName",
      bold."points" AS "boldPoints",
      octopus."match_id" AS "octopusMatchId",
      octopus."player_id" AS "octopusPlayerId",
      octopus_player."name" AS "octopusPlayerName",
      octopus."points" AS "octopusPoints"
    FROM "users"
    LEFT JOIN LATERAL (
      SELECT "match_id", "player_id", "points"
      FROM "bold_scorer_bets"
      WHERE "user_id" = "users"."id"
        AND "cancelled_at" IS NULL
        AND ("usage_round_key" = ${scope.key} OR "match_id" = ${matchId})
      ORDER BY CASE WHEN "match_id" = ${matchId} THEN 0 ELSE 1 END
      LIMIT 1
    ) bold ON true
    LEFT JOIN "players" bold_player ON bold_player."id" = bold."player_id"
    LEFT JOIN LATERAL (
      SELECT "match_id", "player_id", "points"
      FROM "octopus_goalkeeper_bets"
      WHERE "user_id" = "users"."id"
        AND "cancelled_at" IS NULL
        AND ("usage_round_key" = ${scope.key} OR "match_id" = ${matchId})
      ORDER BY CASE WHEN "match_id" = ${matchId} THEN 0 ELSE 1 END
      LIMIT 1
    ) octopus ON true
    LEFT JOIN "players" octopus_player ON octopus_player."id" = octopus."player_id"
    WHERE "users"."id" = ${userId}
    LIMIT 1
  `);
  const usage = usageRows[0];
  const totalPoints = usage
    ? applyOverallLeaderboardBaseline(
        usage.username,
        Number(usage.rawPoints)
      )
    : 0;
  const boldOnThisMatch = usage?.boldMatchId === matchId;
  const octopusOnThisMatch = usage?.octopusMatchId === matchId;
  const hasBoldPoints = totalPoints >= MIN_POINTS_FOR_BOLD_SCORER_BET;
  const maxDoubles = getMaxDoublesForUsageScope(scope);
  const phase = getUsageRoundPhase(scope);
  const allowDoubleWithBold = canCombineDoubleAndBoldForUsageScope(scope);
  const canDoubleBoostBoldScorer = isHighValueBoldScorerRound(scope);

  const doubleOnThisMatch = usage?.doubleOnThisMatch ?? false;
  const doublesInRound = Number(usage?.doublesInRound ?? 0);
  const doublesUsedElsewhere =
    doublesInRound - (doubleOnThisMatch ? 1 : 0);
  const highValueBoldScorer = canDoubleBoostBoldScorer && doubleOnThisMatch;
  const featureBetBlocksDouble =
    Boolean(usage?.octopusMatchId) ||
    (Boolean(usage?.boldMatchId) && !allowDoubleWithBold);

  return {
    roundId: resolvedRoundId,
    usageRoundKey: scope.key,
    phase,
    allowDoubleWithBold,
    doubles: {
      used: doublesInRound,
      max: maxDoubles,
      onThisMatch: doubleOnThisMatch,
      canEnable: doublesUsedElsewhere < maxDoubles && !featureBetBlocksDouble,
      remaining: featureBetBlocksDouble
        ? 0
        : Math.max(0, maxDoubles - doublesUsedElsewhere),
    },
    boldScorer: {
      used: !!usage?.boldMatchId,
      max: MAX_BOLD_SCORER_BETS_PER_ROUND,
      onThisMatch: boldOnThisMatch,
      onOtherMatch: !!usage?.boldMatchId && !boldOnThisMatch,
      canUse:
        boldOnThisMatch ||
        (hasBoldPoints && !usage?.boldMatchId),
      hasMinimumPoints: hasBoldPoints,
      minimumPoints: MIN_POINTS_FOR_BOLD_SCORER_BET,
      userPoints: totalPoints,
      otherMatchId:
        usage?.boldMatchId && !boldOnThisMatch ? usage.boldMatchId : null,
      playerName: boldOnThisMatch ? usage?.boldPlayerName ?? null : null,
      playerId: boldOnThisMatch ? usage?.boldPlayerId ?? null : null,
      points: boldOnThisMatch ? usage?.boldPoints ?? 0 : 0,
      highValue: highValueBoldScorer,
      canDoubleBoost: canDoubleBoostBoldScorer,
      pointsForHit: highValueBoldScorer ? 10 : 5,
      pointsForMiss: highValueBoldScorer ? -10 : -5,
    },
    octopus: {
      used: !!usage?.octopusMatchId,
      max: 1,
      onThisMatch: octopusOnThisMatch,
      onOtherMatch: !!usage?.octopusMatchId && !octopusOnThisMatch,
      canUse: octopusOnThisMatch || !usage?.octopusMatchId,
      otherMatchId:
        usage?.octopusMatchId && !octopusOnThisMatch
          ? usage.octopusMatchId
          : null,
      playerName: octopusOnThisMatch
        ? usage?.octopusPlayerName ?? null
        : null,
      playerId: octopusOnThisMatch ? usage?.octopusPlayerId ?? null : null,
      points: octopusOnThisMatch ? usage?.octopusPoints ?? 0 : 0,
    },
  };
}

export async function getRoundUsageLimits(
  userId: string,
  matchId: string,
  roundId?: string
) {
  try {
    return await unstable_cache(
      () => buildRoundUsageLimits(userId, matchId, roundId),
      ["round-usage-limits-v2", userId, matchId, roundId ?? "auto"],
      {
        revalidate: ROUND_USAGE_LIMITS_CACHE_SECONDS,
        tags: [`matches-user-${userId}`, `match-${matchId}`],
      }
    )();
  } catch (error) {
    if (isMissingNextIncrementalCache(error)) {
      return buildRoundUsageLimits(userId, matchId, roundId);
    }
    throw error;
  }
}
