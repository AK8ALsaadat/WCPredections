import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { getDashboardData } from "../src/services/leaderboard.service";
import { getTournamentRound } from "../src/services/match.service";

async function main() {
  const [userCount, matchCount, tournament] = await Promise.all([
    prisma.user.count(),
    prisma.match.count(),
    getTournamentRound(),
  ]);

  console.log("DB smoke:", { userCount, matchCount, tournament: tournament?.name });

  const sampleUser = await prisma.user.findFirst({ select: { id: true } });
  if (sampleUser) {
    const dash = await getDashboardData(sampleUser.id);
    console.log("Dashboard data OK:", {
      overallEntries: dash.overall.length,
      totalPoints: dash.totalPoints,
    });
  }

  console.log("DB smoke: OK");
}

main()
  .catch((e) => {
    console.error("DB smoke FAILED:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
