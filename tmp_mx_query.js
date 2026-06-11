const { PrismaClient } = require('@prisma/client');
const dotenv = require('dotenv');
dotenv.config();
const prisma = new PrismaClient();
(async () => {
  try {
    const matches = await prisma.match.findMany({
      where: {
        OR: [
          { homeTeam: { name: { contains: 'Mexico', mode: 'insensitive' } } },
          { awayTeam: { name: { contains: 'Mexico', mode: 'insensitive' } } } 
        ]
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        matchScorers: { include: { player: true } },
      },
      take: 20,
    });
    console.log(JSON.stringify(matches, null, 2));
  } catch (err) {
    console.error('ERROR', err && err.message);
  } finally {
    await prisma.$disconnect();
  }
})();
