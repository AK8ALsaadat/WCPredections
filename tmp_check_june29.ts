import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  
  try {
    // Get all upcoming matches scheduled and live for tomorrow
    const tomorrow29 = await prisma.match.findMany({
      where: { 
        status: { in: ['SCHEDULED', 'LIVE'] },
        matchTime: {
          gte: new Date('2026-06-29T00:00:00Z'),
          lt: new Date('2026-06-30T00:00:00Z'),
        }
      },
      include: { 
        homeTeam: { select: { name: true } }, 
        awayTeam: { select: { name: true } } 
      },
      orderBy: { matchTime: 'asc' },
    });

    console.log('Tomorrow (June 29) matches:');
    if (tomorrow29.length === 0) {
      console.log('  No scheduled or live matches tomorrow');
    } else {
      tomorrow29.forEach(m => console.log(`  ${m.homeTeam.name} vs ${m.awayTeam.name} @ ${new Date(m.matchTime).toUTCString()} [${m.status}]`));
    }

  } finally {
    await prisma.$disconnect();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
