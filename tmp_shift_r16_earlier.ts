import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  
  try {
    const roundId = 'cmq993vyw0000cmts6llt4nvo';
    
    // Get all R16 matches
    const r16Matches = await prisma.match.findMany({
      where: {
        roundId,
        isKnockout: true,
        stageName: 'Round of 16',
      },
      include: { 
        homeTeam: { select: { name: true } }, 
        awayTeam: { select: { name: true } } 
      },
    });

    console.log('Adjusting all R16 matches: Shift 3 days EARLIER\n');

    // Shift all matches (except Canada vs South Africa today) back by 3 days
    for (const match of r16Matches) {
      const matchDate = new Date(match.matchTime);
      const homeTeam = match.homeTeam.name;
      const awayTeam = match.awayTeam.name;
      
      // Skip Canada vs South Africa (already today)
      if ((homeTeam === 'Canada' && awayTeam === 'South Africa') || 
          (homeTeam === 'South Africa' && awayTeam === 'Canada')) {
        console.log(`⏭️  Keeping: ${homeTeam} vs ${awayTeam} @ ${matchDate.toUTCString()}`);
        continue;
      }

      // Shift back 3 days
      const newDate = new Date(matchDate);
      newDate.setUTCDate(newDate.getUTCDate() - 3);

      await prisma.match.update({
        where: { id: match.id },
        data: { matchTime: newDate }
      });

      console.log(`✓ ${homeTeam} vs ${awayTeam}: ${matchDate.toUTCString()} → ${newDate.toUTCString()}`);
    }

    console.log('\n✅ All R16 matches shifted to start tomorrow!');

  } finally {
    await prisma.$disconnect();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
