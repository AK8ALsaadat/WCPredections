import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  
  try {
    const roundId = 'cmq993vyw0000cmts6llt4nvo';
    
    // Get teams
    const mexico = await prisma.team.findFirst({ where: { name: 'Mexico' } });
    const canada = await prisma.team.findFirst({ where: { name: 'Canada' } });
    const southAfrica = await prisma.team.findFirst({ where: { name: 'South Africa' } });
    
    if (!mexico || !canada || !southAfrica) {
      console.log('❌ Could not find required teams');
      return;
    }

    console.log('Adjusting Round of 16...\n');
    
    // Delete Mexico and South Africa's old R16 matches
    const mexicoMatches = await prisma.match.findMany({
      where: {
        roundId,
        isKnockout: true,
        stageName: 'Round of 16',
        homeTeamId: mexico.id,
      },
      include: { homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } }
    });

    for (const match of mexicoMatches) {
      await prisma.match.delete({ where: { id: match.id } });
      console.log(`✓ Deleted: ${match.homeTeam.name} vs ${match.awayTeam.name}`);
    }

    const saMatches = await prisma.match.findMany({
      where: {
        roundId,
        isKnockout: true,
        stageName: 'Round of 16',
        awayTeamId: southAfrica.id,
      },
      include: { homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } }
    });

    for (const match of saMatches) {
      await prisma.match.delete({ where: { id: match.id } });
      console.log(`✓ Deleted: ${match.homeTeam.name} vs ${match.awayTeam.name}`);
    }

    // Create Canada vs South Africa match for TODAY at 18:00 UTC
    const todayMatch = await prisma.match.create({
      data: {
        roundId,
        homeTeamId: canada.id,
        awayTeamId: southAfrica.id,
        matchTime: new Date('2026-06-28T18:00:00Z'),
        status: 'SCHEDULED',
        isKnockout: true,
        stageName: 'Round of 16',
      },
    });

    console.log(`\n✓ Created: Canada vs South Africa @ 2026-06-28T18:00:00Z`);

    // Shift all other R16 matches forward by 1 day
    const otherMatches = await prisma.match.findMany({
      where: {
        roundId,
        isKnockout: true,
        stageName: 'Round of 16',
        NOT: { id: todayMatch.id },
      },
    });

    console.log(`\nUpdating ${otherMatches.length} other R16 matches (+1 day)...`);
    for (const match of otherMatches) {
      const newTime = new Date(match.matchTime);
      newTime.setDate(newTime.getDate() + 1);
      
      await prisma.match.update({
        where: { id: match.id },
        data: { matchTime: newTime }
      });
    }

    console.log(`✓ All shifts complete`);

  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
