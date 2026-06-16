/**
 * تصحيح نقاط مباراة السعودية 1-1
 * تشغيل: npx tsx scripts/recalc-saudi-match.ts
 */
import { prisma } from "../src/lib/prisma";
import { recalculateMatchScoring } from "../src/services/prediction.service";

async function main() {
  // البحث عن مباراة السعودية 1-1
  const saudiMatches = await prisma.match.findMany({
    where: {
      OR: [
        { homeTeam: { name: { contains: "Saudi", mode: "insensitive" } } },
        { awayTeam: { name: { contains: "Saudi", mode: "insensitive" } } },
      ],
      homeScore: 1,
      awayScore: 1,
      status: "FINISHED",
    },
    include: {
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
      predictions: { select: { userId: true } },
    },
  });

  if (saudiMatches.length === 0) {
    console.log("❌ لم أجد مباراة السعودية 1-1");
    return;
  }

  for (const match of saudiMatches) {
    console.log(
      `\n📍 وجدت: ${match.homeTeam.name} vs ${match.awayTeam.name} (النتيجة: 1-1)`
    );
    console.log(`   عدد المتنبئين: ${match.predictions.length}`);

    try {
      await recalculateMatchScoring(match.id);
      console.log(`✅ تم إعادة احتساب النقاط بنجاح`);

      // اطبع الملخص
      const updatedPredictions = await prisma.prediction.findMany({
        where: { matchId: match.id },
        select: { userId: true, points: true, doubleBonus: true },
      });

      const totalPoints = updatedPredictions.reduce(
        (sum, p) => sum + (p.points || 0) + (p.doubleBonus || 0),
        0
      );
      console.log(`   إجمالي النقاط الممنوحة: ${totalPoints}`);
    } catch (error) {
      console.error(
        `❌ خطأ:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
