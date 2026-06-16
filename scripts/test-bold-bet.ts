import { prisma } from '@/lib/prisma';
import { submitBoldScorerBet, getBoldScorerBetForMatch } from '@/services/bold-scorer-bet.service';

async function main() {
  // pick an existing user
  const user = await prisma.user.findFirst({ where: { username: 'alsaadat' } });
  if (!user) return console.error('user not found');

  // find a scheduled match with teams and players
  const match = await prisma.match.findFirst({ where: { status: 'SCHEDULED' }, include: { homeTeam: true, awayTeam: true } });
  if (!match) return console.error('no scheduled match found');

  // pick a player from home team
  const player1 = await prisma.player.findFirst({ where: { teamId: match.homeTeamId } });
  const player2 = await prisma.player.findFirst({ where: { teamId: match.awayTeamId } });
  if (!player1 || !player2) return console.error('players not found');

  console.log('Using user', user.username, 'match', match.id);

  // submit first bet
  const bet1 = await submitBoldScorerBet(user.id, match.id, player1.id);
  console.log('Submitted bet1:', bet1?.player?.name ?? null);

  // change to player2
  const bet2 = await submitBoldScorerBet(user.id, match.id, player2.id);
  console.log('Changed to bet2:', bet2?.player?.name ?? null);

  // cancel
  const cancelled = await submitBoldScorerBet(user.id, match.id, null);
  console.log('Cancelled result:', cancelled);

  // verify
  const status = await getBoldScorerBetForMatch(user.id, match.id);
  console.log('Final status:', status);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); process.exit(0); });
