import { prisma } from "../src/lib/prisma";

async function main() {
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "group_code" TEXT'
  );
  console.log("group_code column ready");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
