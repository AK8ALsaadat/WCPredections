const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const users = ['Mohannad', 'alsaadat', 'nawaf', 'mmg', 'ali'];
  for (const u of users) {
    const user = await prisma.user.findUnique({ where: { username: u } });
    if (!user) { console.log(`${u}: not found`); continue; }
    const bold = await prisma.boldScorerBet.findMany({ where: { userId: user.id } });
    const octopus = await prisma.octopusGoalkeeperBet.findMany({ where: { userId: user.id } });
    console.log(`${u} (${user.id}) - bolds: ${bold.length} entries`);
    for (const b of bold) console.log('  bold ->', { matchId: b.matchId, roundId: b.roundId, points: b.points });
    for (const o of octopus) console.log('  octopus ->', { matchId: o.matchId, roundId: o.roundId, points: o.points });
  }
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
