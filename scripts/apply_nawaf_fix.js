const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function getOctopusSaveTierPoints(saves) {
  const count = saves ?? 0;
  if (count >= 10) return 8;
  if (count >= 7) return 5;
  if (count >= 5) return 3;
  if (count >= 3) return 1;
  return 0;
}

function getOctopusConcededCapPoints(goalsConceded) {
  if (goalsConceded == null) return Number.POSITIVE_INFINITY;
  if (goalsConceded >= 3) return 1;
  if (goalsConceded === 2) return 3;
  if (goalsConceded === 1) return 5;
  return Number.POSITIVE_INFINITY;
}

function getOctopusCleanSheetBonus(goalsConceded) {
  return goalsConceded === 0 ? 3 : 0;
}

function calculateOctopusPoints(saves, goalsConceded) {
  const savePoints = Math.min(getOctopusSaveTierPoints(saves), getOctopusConcededCapPoints(goalsConceded));
  return savePoints + getOctopusCleanSheetBonus(goalsConceded);
}

async function main() {
  const username = 'nawaf';
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) { console.log('no user'); return; }

  const bets = await prisma.octopusGoalkeeperBet.findMany({ where: { userId: user.id }, include: { player: true, match: true } });
  if (bets.length === 0) { console.log('no bets'); return; }

  for (const bet of bets) {
    console.log('Checking bet', bet.id, 'match', bet.matchId, 'player', bet.player.name);
    let stat = await prisma.matchGoalkeeperStat.findUnique({ where: { matchId_playerId: { matchId: bet.matchId, playerId: bet.playerId } } });
    if (!stat) {
      console.log('No stat found — creating with 3 saves (manual fix)');
      stat = await prisma.matchGoalkeeperStat.create({ data: { matchId: bet.matchId, playerId: bet.playerId, saves: 3, source: 'manual-fix' } });
    }
    const match = await prisma.match.findUnique({ where: { id: bet.matchId } });
    const saves = stat.saves;
    const goalsConceded = bet.player && match ? (bet.player.teamId === match.homeTeamId ? match.awayScore : match.homeScore) : null;
    const expected = calculateOctopusPoints(saves, goalsConceded);
    console.log({ saves, goalsConceded, stored: bet.points, expected });
    if ((bet.points ?? 0) !== expected) {
      console.log(`Updating bet ${bet.id} points ${bet.points} -> ${expected}`);
      await prisma.octopusGoalkeeperBet.update({ where: { id: bet.id }, data: { points: expected } });
    } else {
      console.log('No update needed');
    }
  }

  console.log('Done');
}

main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>prisma.$disconnect());
