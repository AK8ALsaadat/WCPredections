import { prisma } from "../src/lib/prisma";

async function main() {
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "position" TEXT'
  );
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "shirt_number" INTEGER'
  );
  console.log("player fields ready");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
