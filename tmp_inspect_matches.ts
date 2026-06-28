import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();

  try {
    const matches = await prisma.match.findMany({
      select: {
        id: true,
        matchTime: true,
        status: true,
        homeTeam: { select: { name: true, shortName: true } },
        awayTeam: { select: { name: true, shortName: true } },
      },
      orderBy: { matchTime: 'asc' },
      take: 50,
    });

    console.log(JSON.stringify(matches, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
