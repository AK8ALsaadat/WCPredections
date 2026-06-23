require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

(async function main(){
  try {
    for (const username of ['alsaadat','mohannad']) {
      const user = await prisma.user.findUnique({ where: { username } });
      if (!user) {
        console.log(username, 'NOT FOUND');
        continue;
      }
      console.log('---', username, '---');
      const predictions = await prisma.prediction.findMany({ where: { userId: user.id }, include: { match: true } });
      console.log('predictions count:', predictions.length);
      const scorerPreds = await prisma.scorerPrediction.findMany({ where: { userId: user.id }, include: { player: true, match: true } });
      console.log('scorer predictions count:', scorerPreds.length);
      const bold = await prisma.boldScorerBet.findMany({ where: { userId: user.id }, include: { player: true, match: true } });
      console.log('bold bets:', bold.length);
      const octopus = await prisma.octopusGoalkeeperBet.findMany({ where: { userId: user.id }, include: { player: true, match: true } });
      console.log('octopus bets:', octopus.length);
    }
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
