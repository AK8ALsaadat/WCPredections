import { prisma } from "@/lib/prisma";
import { applyOverallLeaderboardBaseline } from "@/services/baseline-points.service";

export const MIN_POINTS_FOR_BOLD_SCORER_BET = 5;
const USER_TOTAL_POINTS_CACHE_MS = 15_000;
const userTotalPointsCache = new Map<
  string,
  { points: number; expiresAt: number }
>();

async function computeUserTotalPoints(userId: string): Promise<number> {
  const rows = await prisma.$queryRaw<
    { username: string; rawPoints: number | bigint | string }[]
  >`
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
      )::int AS "rawPoints"
    FROM "users"
    WHERE "users"."id" = ${userId}
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) return 0;
  return applyOverallLeaderboardBaseline(row.username, Number(row.rawPoints));
}

export async function getUserTotalPoints(userId: string): Promise<number> {
  const cached = userTotalPointsCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.points;
  }

  const points = await computeUserTotalPoints(userId);
  userTotalPointsCache.set(userId, {
    points,
    expiresAt: Date.now() + USER_TOTAL_POINTS_CACHE_MS,
  });
  return points;
}

export function invalidateUserTotalPointsCache(userId?: string) {
  if (userId) {
    userTotalPointsCache.delete(userId);
    return;
  }
  userTotalPointsCache.clear();
}
