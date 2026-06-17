import { PrismaClient } from "@prisma/client";
import { isPredictionAllowed } from "@/lib/utils";

const prisma = new PrismaClient();

async function main() {
  // الحصول على مباراة مقفلة محددة (مثلاً مباراة هاييتي)
  const matches = await prisma.match.findMany({
    where: {
      OR: [
        { homeTeam: { name: { contains: "Haiti" } } },
        { awayTeam: { name: { contains: "Haiti" } } },
      ],
    },
    include: {
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
      round: { select: { name: true } },
    },
  });

  console.log("Haiti Matches:");
  matches.forEach((match) => {
    console.log(`\n📍 ${match.homeTeam.name} vs ${match.awayTeam.name}`);
    console.log(
      `   Status: ${match.status} | Match Time: ${match.matchTime}`
    );

    // Check if predictions are allowed
    const canPredict = isPredictionAllowed(match.matchTime, match.status);
    console.log(`   Can predict: ${canPredict}`);
  });

  // Now check for a specific user without prediction in a closed match
  const user = await prisma.user.findUnique({
    where: { username: "bdr" },
    select: { id: true, username: true },
  });

  if (user) {
    console.log(`\n\nUser: ${user.username}`);

    const matchIds = matches.map((m) => m.id);
    const userPredictions = await prisma.prediction.findMany({
      where: {
        userId: user.id,
        matchId: { in: matchIds },
      },
    });

    console.log(`Predictions on Haiti matches: ${userPredictions.length}`);

    // Find matches without prediction
    const unpredictedMatches = matches.filter(
      (m) => !userPredictions.some((p) => p.matchId === m.id)
    );

    console.log("\nMatches WITHOUT prediction:");
    unpredictedMatches.forEach((match) => {
      const canPredict = isPredictionAllowed(match.matchTime, match.status);
      console.log(
        `  - ${match.homeTeam.name} vs ${match.awayTeam.name} (Can predict: ${canPredict})`
      );
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
