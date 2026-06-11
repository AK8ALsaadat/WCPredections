require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

(async function inspect(){
  try {
    const scorers = await prisma.scorerPrediction.findMany({
      where: { matchId: 'cmq9yft3t0001la04ev1c5zs3' },
      include: { player: true },
    });
    console.log('scorerPredictions:', JSON.stringify(scorers, null, 2));

    const preds = await prisma.prediction.findMany({ where: { matchId: 'cmq9yft3t0001la04ev1c5zs3' } });
    console.log('predictions count:', preds.length);

    const matchScorers = await prisma.matchScorer.findMany({ where: { matchId: 'cmq9yft3t0001la04ev1c5zs3' }, include: { player: true } });
    console.log('matchScorers:', JSON.stringify(matchScorers, null, 2));
    const boldBets = await prisma.boldScorerBet.findMany({ where: { matchId: 'cmq9yft3t0001la04ev1c5zs3' }, include: { player: true } });
    console.log('boldBets:', JSON.stringify(boldBets, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
})();
