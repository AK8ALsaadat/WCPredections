import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import {
  getCurrentRound,
  getRoundLeaderboard,
  getRoundLeaderboardStats,
} from "../src/services/leaderboard.service";

async function main() {
  const round = await getCurrentRound();
  if (!round) {
    console.log("NO_ROUND");
    return;
  }

  console.log("round:", round.id, round.name);

  const lb = await getRoundLeaderboard(round.id);
  const stats = await getRoundLeaderboardStats(round.id);

  console.log("leaderboard entries:", lb.length);
  console.log("stats:", stats);

  const predictionUsers = await prisma.prediction.findMany({
    where: { match: { roundId: round.id } },
    select: { userId: true, points: true, user: { select: { username: true } } },
    distinct: ["userId"],
  });

  console.log("distinct predictors:", predictionUsers.length);
  for (const u of lb) {
    console.log(`  #${u.rank} @${u.username} = ${u.points}`);
  }

  const manualAvg =
    lb.length > 0
      ? lb.reduce((s, e) => s + e.points, 0) / lb.length
      : 0;
  console.log("manual avg:", Math.round(manualAvg * 10) / 10);
  console.log("service avg:", stats.averagePoints);
  console.log("match:", manualAvg === stats.averagePoints ? "OK" : "MISMATCH");

  const { computeRoundAveragePoints } = await import(
    "../src/services/leaderboard.service"
  );
  const sample = computeRoundAveragePoints([
    { points: 12 },
    { points: 8 },
    { points: 4 },
  ]);
  console.log("unit sample avg (expect 8):", sample, sample === 8 ? "OK" : "FAIL");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
