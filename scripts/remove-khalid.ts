import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // البحث عن khalid
  const user = await prisma.user.findUnique({
    where: { username: "khalid" },
    select: { id: true, username: true },
  });

  if (!user) {
    console.log("User 'khalid' not found.");
    return;
  }

  console.log(`Deleting user: ${user.username}`);

  // حذف المستخدم
  await prisma.user.delete({
    where: { id: user.id },
  });

  console.log(`Done. Removed user '${user.username}'.`);

  // إعادة تصحيح cache الليدربورد
  await revalidateLeaderboardCache();
}

async function revalidateLeaderboardCache() {
  const base = process.env.BASE_URL ?? "https://wc-predections.vercel.app";
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.log("Skip leaderboard cache purge (CRON_SECRET not set).");
    return;
  }

  try {
    const res = await fetch(`${base}/api/cron/revalidate-leaderboard`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
    });
    if (res.ok) {
      console.log("Leaderboard cache purged.");
    } else {
      console.warn("Leaderboard cache purge failed:", res.status);
    }
  } catch (e) {
    console.warn("Could not purge leaderboard cache:", e);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
