require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function normalizeName(name) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^0-9a-z\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function run(matchId) {
  try {
    const matchScorers = await prisma.matchScorer.findMany({
      where: { matchId },
      include: { player: true },
    });

    const goalsByNorm = new Map();
    console.log('matchScorers raw:', matchScorers.map(m=>m.player.name));
    for (const ms of matchScorers) {
      const n = normalizeName(ms.player.name || '');
      console.log('scorer norm:', n, 'goals', ms.goals);
      if (!n) continue;
      const prev = goalsByNorm.get(n) ?? 0;
      goalsByNorm.set(n, prev + ms.goals);
    }

    const scorerPreds = await prisma.scorerPrediction.findMany({
      where: { matchId },
      include: { player: true },
    });

    for (const sp of scorerPreds) {
      const predNorm = normalizeName(sp.player.name || '');
      console.log('predicted norm:', predNorm, 'predGoals', sp.predictedGoals);
      let actualGoals = goalsByNorm.get(predNorm);
      if (actualGoals == null) {
        // try last name match
        const parts = predNorm.split(' ');
        const last = parts[parts.length - 1];
        for (const [n, g] of goalsByNorm.entries()) {
          if (n.split(' ').includes(last)) {
            actualGoals = g;
            console.log('last-name matched', last, '->', n, g);
            break;
          }
        }
      }
      console.log('found actualGoals', actualGoals);

      const points = actualGoals && actualGoals > 0 ? Math.min(sp.predictedGoals, actualGoals) : 0;
      if (points !== sp.points) {
        await prisma.scorerPrediction.update({ where: { id: sp.id }, data: { points } });
        console.log('Updated scorerPrediction', sp.id, 'points->', points);
      }
    }

    // bold bets
    const bolds = await prisma.boldScorerBet.findMany({ where: { matchId } });
    for (const b of bolds) {
      const player = await prisma.player.findUnique({ where: { id: b.playerId } });
      if (!player) continue;
      const n = normalizeName(player.name || '');
      const actualGoals = goalsByNorm.get(n) ?? 0;
      const points = actualGoals > 0 ? 4 : -4;
      if (points !== b.points) {
        await prisma.boldScorerBet.update({ where: { id: b.id }, data: { points } });
        console.log('Updated boldBet', b.id, 'points->', points);
      }
    }

    console.log('Recalc done');
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

const matchId = process.argv[2] || 'cmq9yft3t0001la04ev1c5zs3';
run(matchId).catch(console.error);
