import { prisma } from '@/lib/prisma';
import { isPredictionAllowed } from '@/lib/utils';
import { submitBoldScorerBet, getBoldScorerBetForMatch } from '@/services/bold-scorer-bet.service';

async function main() {
  const username = 'alsaadat';
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) return console.error('user not found');

  // find a match where predictions are allowed
  const matches = await prisma.match.findMany({ where: { status: { in: ['SCHEDULED'] } }, take: 50 });
  const match = matches.find(m => isPredictionAllowed(m.matchTime, m.status));
  if (!match) return console.error('no available match within prediction window');

  // get players
  const player1 = await prisma.player.findFirst({ where: { teamId: match.homeTeamId } });
  const player2 = await prisma.player.findFirst({ where: { teamId: match.awayTeamId } });
  if (!player1 || !player2) return console.error('players not found for match');

  console.log('Using match', match.id, 'time', match.matchTime);

  const bet1 = await submitBoldScorerBet(user.id, match.id, player1.id);
  console.log('Submitted bet1:', bet1?.player?.name ?? null);

  const bet2 = await submitBoldScorerBet(user.id, match.id, player2.id);
  console.log('Changed to bet2:', bet2?.player?.name ?? null);

  const cancelled = await submitBoldScorerBet(user.id, match.id, null);
  console.log('Cancelled result:', cancelled);

  const status = await getBoldScorerBetForMatch(user.id, match.id);
  console.log('Final status:', status);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); process.exit(0); });
