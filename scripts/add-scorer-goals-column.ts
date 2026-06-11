import { prisma } from "../src/lib/prisma";

async function main() {
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "scorer_predictions" ADD COLUMN IF NOT EXISTS "predicted_goals" INTEGER NOT NULL DEFAULT 1'
  );
  console.log("scorer_predictions.predicted_goals ready");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
