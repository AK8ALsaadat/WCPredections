import 'dotenv/config';
import { prisma } from '@/lib/prisma';

(async function main(){
  try {
    const total = await prisma.player.count();
    const withPhoto = await prisma.player.count({ where: { photoUrl: { not: null } } });
    console.log('players_total:', total);
    console.log('players_with_photo:', withPhoto);
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
})();
