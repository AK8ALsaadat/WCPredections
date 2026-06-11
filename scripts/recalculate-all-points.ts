/**
 * إعادة احتساب نقاط الهدافين والنتائج لكل المباريات الجاهزة
 * تشغيل: npx tsx scripts/recalculate-all-points.ts
 */
import { prisma } from "../src/lib/prisma";
import { recalculateMatchScoring } from "../src/services/prediction.service";

async function main() {
  const matches = await prisma.match.findMany({
    where: {
      status: { in: ["LIVE", "FINISHED"] },
      homeScore: { not: null },
      awayScore: { not: null },
    },
    select: {
      id: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
      status: true,
    },
    orderBy: { matchTime: "asc" },
  });

  console.log(`مباريات جاهزة للاحتساب: ${matches.length}`);

  let ok = 0;
  let failed = 0;

  for (const match of matches) {
    try {
      await recalculateMatchScoring(match.id);
      ok++;
      console.log(
        `✓ ${match.homeTeam.name} vs ${match.awayTeam.name} (${match.status})`
      );
    } catch (error) {
      failed++;
      const msg = error instanceof Error ? error.message : String(error);
      console.error(
        `✗ ${match.homeTeam.name} vs ${match.awayTeam.name}: ${msg}`
      );
    }
  }

  console.log(`\nتم: ${ok} | فشل: ${failed}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
