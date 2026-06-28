import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.match.findMany({
      select: {
        id: true,
        apiMatchId: true,
        matchTime: true,
        status: true,
        isKnockout: true,
        stageName: true,
        groupCode: true,
        homeTeam: { select: { id: true, name: true, shortName: true, apiTeamId: true } },
        awayTeam: { select: { id: true, name: true, shortName: true, apiTeamId: true } },
        homeScore: true,
        awayScore: true,
      },
      orderBy: { matchTime: 'asc' },
    });
    console.log(JSON.stringify(rows, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
