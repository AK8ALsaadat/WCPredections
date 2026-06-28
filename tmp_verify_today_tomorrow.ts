import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  
  try {
    // Get all upcoming matches
    const matches = await prisma.match.findMany({
      where: { status: { in: ['SCHEDULED', 'LIVE'] } },
      include: { 
        homeTeam: { select: { name: true } }, 
        awayTeam: { select: { name: true } } 
      },
      orderBy: { matchTime: 'asc' },
      take: 30,
    });

    const today = new Date('2026-06-28');
    const tomorrow = new Date('2026-06-29');

    console.log('📅 TODAY (2026-06-28):');
    const todayMatches = matches.filter(m => {
      const mDate = new Date(m.matchTime);
      return mDate.getUTCDate() === 28 && mDate.getUTCMonth() === 5;
    });
    if (todayMatches.length === 0) console.log('  No matches');
    else todayMatches.forEach(m => console.log(`  ${m.homeTeam.name} vs ${m.awayTeam.name} @ ${new Date(m.matchTime).toUTCString()}`));

    console.log('\n📅 TOMORROW (2026-06-29):');
    const tomorrowMatches = matches.filter(m => {
      const mDate = new Date(m.matchTime);
      return mDate.getUTCDate() === 29 && mDate.getUTCMonth() === 5;
    });
    if (tomorrowMatches.length === 0) console.log('  No matches');
    else tomorrowMatches.forEach(m => console.log(`  ${m.homeTeam.name} vs ${m.awayTeam.name} @ ${new Date(m.matchTime).toUTCString()}`));

    console.log('\n📅 LATER (July 2-7):');
    const later = matches.filter(m => {
      const mDate = new Date(m.matchTime);
      return mDate.getUTCMonth() === 6 && mDate.getUTCDate() >= 2 && mDate.getUTCDate() <= 7;
    });
    if (later.length === 0) console.log('  No matches');
    else later.forEach(m => console.log(`  ${m.homeTeam.name} vs ${m.awayTeam.name} @ ${new Date(m.matchTime).toUTCString()}`));

    // Check Canada specifically
    const canadaMatch = matches.find(m => m.homeTeam.name === 'Canada' || m.awayTeam.name === 'Canada');
    console.log(`\n✅ Canada match appears: ${canadaMatch ? 'YES' : 'NO'}`);
    if (canadaMatch) {
      console.log(`   ${canadaMatch.homeTeam.name} vs ${canadaMatch.awayTeam.name} @ ${new Date(canadaMatch.matchTime).toUTCString()}`);
    }

  } finally {
    await prisma.$disconnect();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
