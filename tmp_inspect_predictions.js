const { prisma } = require('./src/lib/prisma');

async function inspect() {
  const scorers = await prisma.scorerPrediction.findMany({
    where: { matchId: 'cmq9yft3t0001la04ev1c5zs3' },
    include: { player: true },
  });
  console.log('scorerPredictions:', scorers);

  const preds = await prisma.prediction.findMany({ where: { matchId: 'cmq9yft3t0001la04ev1c5zs3' } });
  console.log('predictions count:', preds.length);

  const matchScorers = await prisma.matchScorer.findMany({ where: { matchId: 'cmq9yft3t0001la04ev1c5zs3' }, include: { player: true } });
  console.log('matchScorers:', matchScorers);

  process.exit(0);
}
inspect().catch(e=>{console.error(e); process.exit(1)});
