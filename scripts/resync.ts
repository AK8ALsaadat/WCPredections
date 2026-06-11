import { prisma } from "../src/lib/prisma";
import { syncActiveRoundFromApi } from "../src/services/sync.service";

async function main() {
  const result = await syncActiveRoundFromApi();
  console.log(JSON.stringify(result, null, 2));

  const withGroup = await prisma.match.count({
    where: { groupCode: { not: null } },
  });
  console.log("matches with group", withGroup);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
