const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main(){
  const team = await prisma.team.findFirst({ where: { name: { contains: 'Mexico', mode: 'insensitive' } } });
  console.log('team:', team);
  await prisma.$disconnect();
}

main().catch(e=>{console.error(e); prisma.$disconnect(); process.exit(1);});
