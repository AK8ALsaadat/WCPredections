import { prisma } from "@/lib/prisma";

export const MIN_POINTS_FOR_BOLD_SCORER_BET = 5;

export async function getUserTotalPoints(userId: string): Promise<number> {
  const [predictionAgg, scorerAgg, boldAgg] = await Promise.all([
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
      where: { userId },
      _sum: { points: true },
    }),
  ]);

  return (
    (predictionAgg._sum.points ?? 0) +
    (predictionAgg._sum.doubleBonus ?? 0) +
    (predictionAgg._sum.finishTypePoints ?? 0) +
    (predictionAgg._sum.penaltyWinnerPoints ?? 0) +
    (scorerAgg._sum.points ?? 0) +
    (boldAgg._sum.points ?? 0)
  );
}
