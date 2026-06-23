import { prisma } from '@/lib/prisma';
import { calculateOctopusPointsForMatch } from '@/services/octopus-bet.service';

async function main() {
  const matches = await prisma.match.findMany({
    where: { status: 'FINISHED', octopusBets: { some: {} } },
    select: { id: true },
  });

  console.log('Found', matches.length, 'finished matches with octopus bets');

  for (const { id } of matches) {
    try {
      console.log('Recalculating octopus for match', id);
      await calculateOctopusPointsForMatch(id);
      const bets = await prisma.octopusGoalkeeperBet.findMany({
        where: { matchId: id },
        include: {
          user: { select: { username: true } },
          player: { select: { name: true } },
        },
      });
      for (const b of bets) {
        console.log('-', b.user.username, 'player=', b.player.name, 'points=', b.points);
      }
    } catch (err) {
      console.error('Failed to recalc for', id, err instanceof Error ? err.message : err);
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
