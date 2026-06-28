import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const match = await prisma.match.findFirst({
      where: {
        OR: [
          { homeTeam: { name: { contains: 'Canada' } } },
          { awayTeam: { name: { contains: 'Canada' } } },
        ],
      },
      include: {
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
      },
      orderBy: { matchTime: 'asc' },
    });
    console.log(JSON.stringify(match, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
