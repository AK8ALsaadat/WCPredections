import { prisma } from "../src/lib/prisma";
import { syncActiveRoundFromApi } from "../src/services/sync.service";

async function main() {
  console.log("تنظيف بيانات المباريات القديمة...");
  await prisma.scorerPrediction.deleteMany();
  await prisma.prediction.deleteMany();
  await prisma.matchScorer.deleteMany();
  await prisma.match.deleteMany();
  await prisma.player.deleteMany();
  await prisma.team.deleteMany();

  console.log("مزامنة كأس العالم 2026 من football-data.org...");
  const result = await syncActiveRoundFromApi();
  console.log(JSON.stringify(result, null, 2));

  const counts = {
    teams: await prisma.team.count(),
    matches: await prisma.match.count(),
  };
  console.log("النتيجة:", counts);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
