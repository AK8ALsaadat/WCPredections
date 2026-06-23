const { PrismaClient } = require('@prisma/client');

(async function main(){
  const prisma = new PrismaClient();
  try {
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { username: { startsWith: 'qa_' } },
          { username: { startsWith: 'ui_qa_' } },
        ],
      },
      select: { id: true, username: true },
    });

    if (!users || users.length === 0) {
      console.log('No QA users found.');
      return;
    }

    console.log('QA users found:', users.length);
    for (const u of users) {
      const p = await prisma.prediction.count({ where: { userId: u.id } });
      const s = await prisma.scorerPrediction.count({ where: { userId: u.id } });
      const b = await prisma.boldScorerBet.count({ where: { userId: u.id } });
      const o = await prisma.octopusGoalkeeperBet.count({ where: { userId: u.id } });
      console.log(u.username, 'predictions=', p, 'scorerPredictions=', s, 'bold=', b, 'octopus=', o);
    }
  } catch (e) {
    console.error(e);
  } finally {
    await (new PrismaClient()).$disconnect();
  }
})();
