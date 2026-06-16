const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    // البحث عن خالد
    const user = await prisma.user.findUnique({ where: { username: 'khalid' } });
    if (user) {
      console.log('Found user:', user);
      // حذف المستخدم وجميع تنبؤاته
      await prisma.user.delete({ where: { id: user.id } });
      console.log('User khalid deleted successfully');
    } else {
      console.log('User khalid not found');
    }
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
})();
