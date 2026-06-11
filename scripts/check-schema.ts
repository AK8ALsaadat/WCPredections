import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const cols = await prisma.$queryRaw<
    { table_name: string; column_name: string; data_type: string; udt_name: string }[]
  >`
    SELECT table_name, column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('rounds', 'users', 'matches', 'teams')
    ORDER BY table_name, ordinal_position
  `;
  console.log(JSON.stringify(cols, null, 2));
}

main().finally(() => prisma.$disconnect());
