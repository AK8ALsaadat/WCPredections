import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  
  try {
    // Check ALL matches for June 28-29 (not just scheduled/live)
    const june28 = await prisma.match.findMany({
      where: {
        matchTime: {
          gte: new Date('2026-06-28T00:00:00Z'),
          lt: new Date('2026-06-29T00:00:00Z'),
        }
      },
      include: { 
        homeTeam: { select: { name: true } }, 
        awayTeam: { select: { name: true } } 
      },
      orderBy: { matchTime: 'asc' },
    });

    const june29 = await prisma.match.findMany({
      where: {
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

    console.log('📅 JUNE 28 (TODAY):');
    if (june28.length === 0) {
      console.log('  No matches');
    } else {
      june28.forEach(m => {
        const dateStr = new Date(m.matchTime).toUTCString();
        console.log(`  ${m.homeTeam.name} vs ${m.awayTeam.name} @ ${dateStr} [${m.status}]`);
      });
    }

    console.log('\n📅 JUNE 29 (TOMORROW):');
    if (june29.length === 0) {
      console.log('  ❌ NO MATCHES FOUND');
    } else {
      june29.forEach(m => {
        const dateStr = new Date(m.matchTime).toUTCString();
        console.log(`  ${m.homeTeam.name} vs ${m.awayTeam.name} @ ${dateStr} [${m.status}]`);
      });
    }

    // Check for Japan and Brazil
    console.log('\n🔍 Searching for Brazil and Japan matches:');
    const japanBrazil = await prisma.match.findMany({
      where: {
        OR: [
          { homeTeam: { name: 'Brazil' } },
          { awayTeam: { name: 'Brazil' } },
          { homeTeam: { name: 'Japan' } },
          { awayTeam: { name: 'Japan' } },
        ]
      },
      include: { 
        homeTeam: { select: { name: true } }, 
        awayTeam: { select: { name: true } } 
      },
      orderBy: { matchTime: 'asc' },
    });

    japanBrazil.forEach(m => {
      const dateStr = new Date(m.matchTime).toUTCString();
      console.log(`  ${m.homeTeam.name} vs ${m.awayTeam.name} @ ${dateStr} [${m.status}]`);
    });

  } finally {
    await prisma.$disconnect();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
