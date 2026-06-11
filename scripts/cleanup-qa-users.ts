import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const qaUsers = await prisma.user.findMany({
    where: {
      OR: [
        { username: { startsWith: "qa_" } },
        { username: { startsWith: "ui_qa_" } },
      ],
    },
    select: { id: true, username: true },
  });

  if (qaUsers.length === 0) {
    console.log("No QA test users found.");
    return;
  }

  console.log(`Deleting ${qaUsers.length} QA user(s):`);
  for (const u of qaUsers) {
    console.log(`  - ${u.username}`);
  }

  const ids = qaUsers.map((u) => u.id);
  const deleted = await prisma.user.deleteMany({
    where: { id: { in: ids } },
  });

  console.log(`Done. Removed ${deleted.count} user(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
