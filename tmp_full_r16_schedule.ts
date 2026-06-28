import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  
  try {
    // Get all upcoming matches in order
    const matches = await prisma.match.findMany({
      where: {
        status: { in: ['SCHEDULED', 'LIVE'] },
        isKnockout: true,
      },
      include: { 
        homeTeam: { select: { name: true } }, 
        awayTeam: { select: { name: true } } 
      },
      orderBy: { matchTime: 'asc' },
    });

    console.log('🏆 ROUND OF 16 SCHEDULE:\n');
    matches.forEach((m, idx) => {
      const date = new Date(m.matchTime);
      const dateStr = date.toUTCString();
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      console.log(`${idx + 1}. ${m.homeTeam.name} vs ${m.awayTeam.name} @ ${dayName} ${date.getUTCHours()}:00 UTC`);
    });

    // Specifically check for Brazil and Japan
    console.log('\n🔍 Brazil matches:');
    const brazil = matches.filter(m => m.homeTeam.name === 'Brazil' || m.awayTeam.name === 'Brazil');
    brazil.forEach(m => {
      const date = new Date(m.matchTime);
      console.log(`  ${m.homeTeam.name} vs ${m.awayTeam.name} @ ${date.toUTCString()}`);
    });

    console.log('\n🔍 Japan matches:');
    const japan = matches.filter(m => m.homeTeam.name === 'Japan' || m.awayTeam.name === 'Japan');
    japan.forEach(m => {
      const date = new Date(m.matchTime);
      console.log(`  ${m.homeTeam.name} vs ${m.awayTeam.name} @ ${date.toUTCString()}`);
    });

  } finally {
    await prisma.$disconnect();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
