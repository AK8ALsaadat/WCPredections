const { PrismaClient } = require('@prisma/client');

(async () => {
  const prisma = new PrismaClient();
  try {
    // Find Belgium team
    const team = await prisma.team.findFirst({
      where: {
        OR: [
          { name: { contains: 'Belgium', mode: 'insensitive' } },
          { shortName: { contains: 'BEL', mode: 'insensitive' } },
        ],
      },
    });

    if (!team) {
      console.log('Team Belgium not found in DB.');
      return;
    }

    // Find last finished match involving Belgium
    const match = await prisma.match.findFirst({
      where: {
        status: 'FINISHED',
        OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }],
      },
      orderBy: { matchTime: 'desc' },
      select: { id: true, matchTime: true, homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true },
    });

    if (!match) {
      console.log('No finished matches for Belgium found in DB.');
      return;
    }

    console.log('Last finished match for Belgium found:', match.id, match.matchTime);

    const stats = await prisma.matchGoalkeeperStat.findMany({
      where: { matchId: match.id },
      include: { player: { select: { id: true, name: true } } },
    });

    if (!stats || stats.length === 0) {
      console.log('No goalkeeper stats recorded for that match in DB.');
      return;
    }

    const courtoisStat = stats.find(s => s.player?.name?.toLowerCase().includes('courtois') || false);
    if (!courtoisStat) {
      console.log('No entry for Courtois in match goalkeeper stats. Available stats:');
      for (const s of stats) {
        console.log('-', s.player?.name || s.playerId, 'saves=', s.saves);
      }
      return;
    }

    console.log(`Courtois saves in that match: ${courtoisStat.saves}`);
  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : err);
  } finally {
    await (new PrismaClient()).$disconnect();
  }
})();
