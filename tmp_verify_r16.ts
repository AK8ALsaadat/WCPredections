import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  
  try {
    const r16 = await prisma.match.findMany({
      where: { 
        isKnockout: true, 
        stageName: 'Round of 16' 
      },
      include: { 
        homeTeam: { select: { name: true } }, 
        awayTeam: { select: { name: true } } 
      },
      orderBy: { matchTime: 'asc' },
      take: 15,
    });

    console.log('Round of 16 Matches:\n');
    r16.forEach(m => console.log(`${m.homeTeam.name} vs ${m.awayTeam.name} @ ${m.matchTime}`));

    const canadaMatch = r16.find(m => m.homeTeam.name === 'Canada' || m.awayTeam.name === 'Canada');
    console.log(`\n✓ Canada match found: ${canadaMatch ? canadaMatch.homeTeam.name + ' vs ' + canadaMatch.awayTeam.name : 'Not found'}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
