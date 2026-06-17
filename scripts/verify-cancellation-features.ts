import { prisma } from "../src/lib/prisma";
import { submitPrediction, submitMatchPredictionBundle } from "../src/services/prediction.service";
import { submitBoldScorerBet } from "../src/services/bold-scorer-bet.service";
import { getUsageRoundScope } from "../src/services/usage-round.service";

async function main() {
  console.log("🚀 بدء اختبار ميزات الإلغاء والقيود (المضاعفة والرهان)...");

  // 1. إعداد الاختبار
  const user = await prisma.user.findFirst({ where: { username: "abdullah" } });
  if (!user) {
    console.error("❌ لم يتم العثور على المستخدم 'abdullah' للاختبار.");
    process.exit(1);
  }

  const match = await prisma.match.findFirst({
    where: { status: "SCHEDULED" },
    include: { homeTeam: true, awayTeam: true },
  });
  if (!match) {
    console.error("❌ لم يتم العثور على مباراة مجدولة للاختبار.");
    process.exit(1);
  }
  
  const player1 = await prisma.player.findFirst({ where: { teamId: match.homeTeamId } });
  const player2 = await prisma.player.findFirst({ where: { teamId: match.awayTeamId } });
  if (!player1 || !player2) {
    console.error("❌ لم يتم العثور على لاعبين للاختبار.");
    process.exit(1);
  }

  console.log(`- المستخدم: ${user.username}`);
  console.log(`- المباراة: ${match.homeTeam.name} vs ${match.awayTeam.name}`);

  // --- بداية الاختبارات ---

  // 2. اختبار إلغاء المضاعفة (Double Points)
  console.log("\n✨ [1/3] اختبار إلغاء المضاعفة...");
  try {
    await submitPrediction(user.id, { matchId: match.id, predHome: 1, predAway: 0, isDouble: true });
    let pred = await prisma.prediction.findUnique({ where: { userId_matchId: { userId: user.id, matchId: match.id } } });
    if (!pred?.isDouble) throw new Error("فشل تفعيل المضاعفة.");
    console.log("  ✅ تم تفعيل المضاعفة بنجاح.");

    await submitPrediction(user.id, { matchId: match.id, predHome: 1, predAway: 0, isDouble: false });
    pred = await prisma.prediction.findUnique({ where: { userId_matchId: { userId: user.id, matchId: match.id } } });
    if (pred?.isDouble) throw new Error("فشل إلغاء المضاعفة. لا تزال مفعلة.");
    console.log("  ✅ تم إلغاء المضاعفة بنجاح.");
  } catch (error) {
    console.error("  ❌ فشل اختبار المضاعفة:", error instanceof Error ? error.message : error);
    process.exit(1);
  }

  // 3. اختبار تغيير وإلغاء الرهان الجريء (Bold Bet)
  console.log("\n🃏 [2/3] اختبار تغيير وإلغاء الرهان...");
  try {
    await submitBoldScorerBet(user.id, match.id, player1.id);
    let bet = await prisma.boldScorerBet.findFirst({ where: { userId: user.id, matchId: match.id } });
    if (bet?.playerId !== player1.id) throw new Error("فشل تفعيل الرهان.");
    console.log(`  ✅ تم تفعيل الرهان على اللاعب (${player1.name}) بنجاح.`);

    await submitBoldScorerBet(user.id, match.id, player2.id);
    bet = await prisma.boldScorerBet.findFirst({ where: { userId: user.id, matchId: match.id } });
    if (bet?.playerId !== player2.id) throw new Error("فشل تغيير لاعب الرهان.");
    console.log(`  ✅ تم تغيير لاعب الرهان إلى (${player2.name}) بنجاح.`);

    await submitBoldScorerBet(user.id, match.id, null);
    bet = await prisma.boldScorerBet.findFirst({ where: { userId: user.id, matchId: match.id } });
    if (bet) throw new Error("فشل إلغاء الرهان. لا يزال موجوداً.");
    console.log("  ✅ تم إلغاء الرهان بنجاح.");
  } catch (error) {
    console.error("  ❌ فشل اختبار الرهان:", error instanceof Error ? error.message : error);
    process.exit(1);
  }

  // 4. اختبار منع استخدام المضاعفة والرهان معاً
  console.log("\n🚫 [3/3] اختبار منع الجمع بين المضاعفة والرهان...");
  try {
    await submitMatchPredictionBundle(user.id, { matchId: match.id, predHome: 2, predAway: 1, isDouble: true, picks: [], boldPlayerId: player1.id });
    throw new Error("النظام سمح بالجمع بين المضاعفة والرهان بالخطأ.");
  } catch (error) {
    if (error instanceof Error && error.message.includes("ما تقدر تستخدم المضاعفة والرهان معاً")) {
        console.log("  ✅ تم منع الجمع بين المضاعفة والرهان بنجاح.");
    } else {
        console.error("  ❌ فشل اختبار منع الجمع:", error instanceof Error ? error.message : error);
        process.exit(1);
    }
  }
  
  await prisma.prediction.deleteMany({ where: { userId: user.id, matchId: match.id } });
  const scope = await getUsageRoundScope(match.id);
  await prisma.boldScorerBet.deleteMany({ where: { userId: user.id, usageRoundKey: scope.key } });
  console.log("\n🧹 تم تنظيف بيانات الاختبار.");

  console.log("\n\n🎉🎉🎉 كل الاختبارات المطلوبة نجحت 100% 🎉🎉🎉");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());