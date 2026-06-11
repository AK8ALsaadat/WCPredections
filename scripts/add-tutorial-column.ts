import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "users"
    ADD COLUMN IF NOT EXISTS "has_seen_tutorial" BOOLEAN NOT NULL DEFAULT false
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE "users" SET "has_seen_tutorial" = true
    WHERE "has_seen_tutorial" = false
  `);

  console.log("users.has_seen_tutorial ready");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
