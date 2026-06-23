import { calculateOctopusPointsForMatch } from '@/services/octopus-bet.service';
import { prisma } from '@/lib/prisma';

const MATCH_ID = process.argv[2] ?? 'cmq996tcb003gcmtscxb2uc9b';

async function main() {
  console.log('Recalculating octopus points for match:', MATCH_ID);
  await calculateOctopusPointsForMatch(MATCH_ID);

  const bets = await prisma.octopusGoalkeeperBet.findMany({
    where: { matchId: MATCH_ID },
    include: { user: { select: { username: true } }, player: { select: { name: true } } },
  });

  console.log('Octopus bets after recalculation:');
  for (const b of bets) {
    console.log('-', b.user.username, 'player=', b.player.name, 'points=', b.points);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
