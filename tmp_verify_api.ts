import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  
  try {
    // Simulate what the API does
    const matches = await prisma.match.findMany({
      where: { status: { in: ['SCHEDULED', 'LIVE'] } },
      include: { 
        homeTeam: { select: { id: true, name: true } }, 
        awayTeam: { select: { id: true, name: true } } 
      },
      orderBy: { matchTime: 'asc' },
      take: 20,
    });

    console.log('Upcoming matches (next 20):');
    let knockoutCount = 0;
    matches.forEach(m => {
      if (m.isKnockout) knockoutCount++;
      console.log(`${m.isKnockout ? '🏆' : '  '} ${m.homeTeam.name} vs ${m.awayTeam.name} @ ${m.matchTime}`);
    });

    console.log(`\nTotal: ${matches.length} matches`);
    console.log(`Knockout matches: ${knockoutCount}`);
    
    const canadaMatch = matches.find(m => m.homeTeam.name === 'Mexico' && m.awayTeam.name === 'Canada');
    console.log(`\n✓ Canada will appear in upcoming list: ${canadaMatch ? 'YES ✓' : 'NO ✗'}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
