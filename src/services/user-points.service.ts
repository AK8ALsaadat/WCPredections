import { prisma } from "@/lib/prisma";
import { applyOverallLeaderboardBaseline } from "@/services/baseline-points.service";

export const MIN_POINTS_FOR_BOLD_SCORER_BET = 5;

export async function getUserTotalPoints(userId: string): Promise<number> {
  const [user, predictionAgg, scorerAgg, boldAgg, octopusAgg, bracket] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    }),
    prisma.prediction.aggregate({
      where: { userId },
      _sum: {
        points: true,
        doubleBonus: true,
        finishTypePoints: true,
        penaltyWinnerPoints: true,
      },
    }),
    prisma.scorerPrediction.aggregate({
      where: { userId },
      _sum: { points: true },
    }),
    prisma.boldScorerBet.aggregate({
      where: { userId, cancelledAt: null },
      _sum: { points: true },
    }),
    prisma.octopusGoalkeeperBet.aggregate({
      where: { userId, cancelledAt: null },
      _sum: { points: true },
    }),
    prisma.knockoutBracketPrediction.findUnique({
      where: { userId },
      select: {
        finalistOnePoints: true,
        finalistTwoPoints: true,
        championPoints: true,
      },
    }),
  ]);

  const rawPoints =
    (predictionAgg._sum.points ?? 0) +
    (predictionAgg._sum.doubleBonus ?? 0) +
    (predictionAgg._sum.finishTypePoints ?? 0) +
    (predictionAgg._sum.penaltyWinnerPoints ?? 0) +
    (scorerAgg._sum.points ?? 0) +
    (boldAgg._sum.points ?? 0) +
    (octopusAgg._sum.points ?? 0) +
    (bracket?.finalistOnePoints ?? 0) +
    (bracket?.finalistTwoPoints ?? 0) +
    (bracket?.championPoints ?? 0);

  return user
    ? applyOverallLeaderboardBaseline(user.username, rawPoints)
    : rawPoints;
}
