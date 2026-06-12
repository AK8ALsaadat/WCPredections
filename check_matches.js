const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const statuses = await prisma.match.groupBy({
    by: ['status'],
    _count: true
  });
  
  console.log('Match statuses:');
  console.log(JSON.stringify(statuses, null, 2));
  
  // Check if there are any finished matches
  const finished = await prisma.match.findMany({
    where: { status: 'FINISHED' },
    take: 3
  });
  
  console.log('\nFinished matches count:', finished.length);
  if (finished.length > 0) {
    console.log('Sample finished match:', finished[0].id);
  }
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); });
