import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // البحث عن المستخدم dawoad
  const user = await prisma.user.findUnique({
    where: { username: "dawoad" },
    select: { id: true, username: true },
  });

  if (!user) {
    console.log("User 'dawoad' not found.");
    return;
  }

  console.log(`Found user: ${user.username}`);

  // البحث عن مباريات هاييتي
  const haitiMatches = await prisma.match.findMany({
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

  console.log(`\nFound ${haitiMatches.length} Haiti match(es):`);
  haitiMatches.forEach((match) => {
    console.log(
      `  - ${match.homeTeam.name} vs ${match.awayTeam.name} (${match.round.name})`
    );
  });

  // البحث عن تنبؤات dawoad في مباريات هاييتي
  const haitiMatchIds = haitiMatches.map((m) => m.id);

  const predictions = await prisma.prediction.findMany({
    where: {
      userId: user.id,
      matchId: { in: haitiMatchIds },
    },
    include: {
      match: {
        include: {
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
          round: { select: { name: true } },
        },
      },
    },
  });

  if (predictions.length === 0) {
    console.log(`\n❌ dawoad ليس لديه توقعات في مباريات هاييتي`);
  } else {
    console.log(
      `\n✅ dawoad لديه ${predictions.length} توقع(ات) في مباريات هاييتي:`
    );
    predictions.forEach((pred) => {
      let result = "تعادل";
      if (pred.predHome > pred.predAway) {
        result = `${pred.match.homeTeam.name} (${pred.predHome}-${pred.predAway})`;
      } else if (pred.predAway > pred.predHome) {
        result = `${pred.match.awayTeam.name} (${pred.predHome}-${pred.predAway})`;
      } else {
        result = `تعادل (${pred.predHome}-${pred.predAway})`;
      }
      console.log(
        `  - ${pred.match.homeTeam.name} vs ${pred.match.awayTeam.name}: ${result}`
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
