import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    // Get group stage results
    const groupMatches = await prisma.match.findMany({
      where: {
        groupCode: { not: null },
        status: 'FINISHED',
        homeScore: { not: null },
        awayScore: { not: null },
      },
      include: {
        homeTeam: true,
        awayTeam: true,
      },
    });

    // Group by group code
    const groups = new Map<string, any[]>();
    for (const m of groupMatches) {
      const code = m.groupCode?.replace('GROUP_', '') || '';
      if (!groups.has(code)) groups.set(code, []);
      groups.get(code)!.push(m);
    }

    console.log('Groups with matches:');
    for (const [code, matches] of groups.entries()) {
      console.log(`Group ${code}: ${matches.length} matches`);
    }

    // Count total groups with at least 3 matches completed
    let completedGroups = 0;
    for (const matches of groups.values()) {
      if (matches.length >= 3) completedGroups++;
    }
    console.log(`\nTotal completed groups: ${completedGroups}/12`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
