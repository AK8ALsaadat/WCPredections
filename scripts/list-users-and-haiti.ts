import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // الحصول على جميع المستخدمين
  const users = await prisma.user.findMany({
    select: { id: true, username: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  console.log(`Found ${users.length} user(s):`);
  users.forEach((user) => {
    console.log(`  - ${user.username}`);
  });

  // البحث عن مباريات هاييتي
  console.log("\nSearching for Haiti matches...");
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

  if (haitiMatches.length === 0) {
    console.log("❌ No Haiti matches found");
  } else {
    console.log(`Found ${haitiMatches.length} Haiti match(es):`);
    haitiMatches.forEach((match) => {
      console.log(
        `  - ${match.homeTeam.name} vs ${match.awayTeam.name} (${match.round.name})`
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
