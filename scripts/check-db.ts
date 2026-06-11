import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
  `;
  console.log("Tables:", tables.map((t) => t.tablename));

  try {
    const rounds = await prisma.round.findMany({ take: 3 });
    console.log("Rounds:", rounds);
  } catch (e) {
    console.log("Rounds error:", e);
  }

  try {
    const users = await prisma.user.findMany({ take: 3 });
    console.log("Users:", users.length);
  } catch (e) {
    console.log("Users error:", e);
  }
}

main().finally(() => prisma.$disconnect());
