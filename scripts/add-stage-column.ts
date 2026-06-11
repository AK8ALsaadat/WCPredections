import { prisma } from "../src/lib/prisma";

async function main() {
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "stage_name" TEXT'
  );
  console.log("stage_name column ready");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
