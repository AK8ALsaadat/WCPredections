import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const qaUsers = await prisma.user.findMany({
    where: {
      isAdmin: false,
      OR: [
        { username: { startsWith: "qa_" } },
        { username: { startsWith: "ui_qa_" } },
        { username: { startsWith: "test" } },
        { username: { contains: "tester", mode: "insensitive" } },
        { username: { startsWith: "demo" } },
        { username: { startsWith: "sample" } },
        { username: { startsWith: "tmp" } },
        { username: { contains: "_test", mode: "insensitive" } },
        { username: "u446869" },
      ],
    },
    select: { id: true, username: true },
  });

  if (qaUsers.length === 0) {
    console.log("No QA/test users found.");
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

  if (deleted.count > 0) {
    await revalidateLeaderboardCache();
  }
}

async function revalidateLeaderboardCache() {
  const base = process.env.BASE_URL ?? "https://wc-predections.vercel.app";
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.log("Skip leaderboard cache purge (CRON_SECRET not set).");
    return;
  }

  const res = await fetch(`${base}/api/cron/revalidate-leaderboard`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (res.ok) {
    console.log("Leaderboard cache purged.");
  } else {
    console.warn("Leaderboard cache purge failed:", res.status);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
