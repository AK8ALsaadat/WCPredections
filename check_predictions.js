const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  // Get finished matches
  const finished = await prisma.match.findMany({
    where: { status: 'FINISHED' },
    include: {
      predictions: {
        where: { user: { username: 'alsaadat' } }
      },
      homeTeam: { select: { shortName: true } },
      awayTeam: { select: { shortName: true } }
    }
  });
  
  console.log('Finished matches with user predictions:');
  finished.forEach(m => {
    console.log(`\n${m.homeTeam.shortName} vs ${m.awayTeam.shortName}`);
    console.log(`Match ID: ${m.id}`);
    console.log(`Status: ${m.status}`);
    console.log(`Has user prediction: ${m.predictions.length > 0}`);
    if (m.predictions.length > 0) {
      console.log(`Prediction: ${m.predictions[0].predHome} - ${m.predictions[0].predAway}`);
    }
  });
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); });
