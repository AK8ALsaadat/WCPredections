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
  if (goalsConceded >= 3) return 1; // OCTOPUS_POINTS.three
  if (goalsConceded === 2) return 3; // five
  if (goalsConceded === 1) return 5; // seven
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
  if (!user) {
    console.log(`User ${username} not found.`);
    return;
  }

  const bets = await prisma.octopusGoalkeeperBet.findMany({
    where: { userId: user.id },
    include: { player: true, match: true },
  });

  if (bets.length === 0) {
    console.log(`No octopus bets for ${username}`);
    return;
  }

  for (const bet of bets) {
    const match = await prisma.match.findUnique({ where: { id: bet.matchId } });
    const stat = await prisma.matchGoalkeeperStat.findUnique({ where: { matchId_playerId: { matchId: bet.matchId, playerId: bet.playerId } } });
    const saves = stat ? stat.saves : null;
    const goalsConceded = bet.player && match ? (bet.player.teamId === match.homeTeamId ? match.awayScore : match.homeScore) : null;
    const expected = calculateOctopusPoints(saves, goalsConceded);
    console.log('Bet:', { betId: bet.id, matchId: bet.matchId, playerId: bet.playerId, playerName: bet.player.name, saves, goalsConceded, storedPoints: bet.points, expectedPoints: expected });
    if ((bet.points ?? 0) !== expected) {
      console.log(` -> Updating bet ${bet.id} points ${bet.points} -> ${expected}`);
      await prisma.octopusGoalkeeperBet.update({ where: { id: bet.id }, data: { points: expected } });
    }
  }

  // revalidate leaderboard via API if env available
  const base = process.env.BASE_URL || 'https://wc-predections.vercel.app';
  const secret = process.env.CRON_SECRET;
  if (secret) {
    try {
      // Prefer global fetch (Node 18+); fall back to node-fetch only if necessary
      let fetchFn = typeof fetch === 'function' ? fetch.bind(globalThis) : null;
      if (!fetchFn) {
        try {
          const mod = await import('node-fetch');
          fetchFn = mod.default || mod;
        } catch (e) {
          console.warn('node-fetch not available, cannot revalidate leaderboard:', e.message || e);
        }
      }

      if (fetchFn) {
        const res = await fetchFn(`${base}/api/cron/revalidate-leaderboard`, { method: 'POST', headers: { Authorization: `Bearer ${secret}` } });
        console.log('Revalidate leaderboard status:', res.status);
      } else {
        console.log('Fetch unavailable — skipped leaderboard revalidate.');
      }
    } catch (err) {
      console.warn('Revalidate failed:', err.message || err);
    }
  } else {
    console.log('CRON_SECRET not set — skipped leaderboard revalidate.');
  }

  console.log('Done.');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
