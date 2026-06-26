import { prisma } from "../src/lib/prisma";
import { calculateOctopusPointsForMatch } from "../src/services/octopus-bet.service";

const SOURCE = "manual-source:worldcup.ekantipur-match-535";
const SAVES = 5;

async function purgeLeaderboardCache() {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.log("[repair] Skip leaderboard cache purge (CRON_SECRET not set).");
    return;
  }

  const configuredBase = process.env.NEXT_PUBLIC_APP_URL;
  const base =
    configuredBase && !/localhost|127\.0\.0\.1/i.test(configuredBase)
      ? configuredBase
      : "https://wc-predections.vercel.app";

  try {
    const res = await fetch(`${base}/api/cron/revalidate-leaderboard`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
    });
    console.log(`[repair] leaderboard cache purge: ${res.status}`);
  } catch (error) {
    console.warn(
      "[repair] leaderboard cache purge skipped:",
      error instanceof Error ? error.message : error
    );
  }
}

async function main() {
  const match = await prisma.match.findFirst({
    where: {
      status: "FINISHED",
      homeTeam: { name: { equals: "Scotland", mode: "insensitive" } },
      awayTeam: { name: { equals: "Brazil", mode: "insensitive" } },
    },
    orderBy: { matchTime: "desc" },
    select: {
      id: true,
      homeScore: true,
      awayScore: true,
      matchTime: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { id: true, name: true } },
      octopusBets: {
        where: { cancelledAt: null },
        select: {
          id: true,
          points: true,
          playerId: true,
          user: { select: { username: true } },
          player: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!match) throw new Error("Scotland vs Brazil match not found");

  const alisson =
    match.octopusBets.find((bet) =>
      bet.player.name.toLowerCase().includes("alisson")
    )?.player ??
    (await prisma.player.findFirst({
      where: {
        teamId: match.awayTeam.id,
        name: { contains: "Alisson", mode: "insensitive" },
      },
      select: { id: true, name: true },
    }));

  if (!alisson) throw new Error("Alisson player not found");

  const before = match.octopusBets.map((bet) => ({
    username: bet.user.username,
    player: bet.player.name,
    points: bet.points,
  }));

  await prisma.matchGoalkeeperStat.upsert({
    where: {
      matchId_playerId: {
        matchId: match.id,
        playerId: alisson.id,
      },
    },
    create: {
      matchId: match.id,
      playerId: alisson.id,
      saves: SAVES,
      source: SOURCE,
    },
    update: {
      saves: SAVES,
      source: SOURCE,
    },
  });

  await calculateOctopusPointsForMatch(match.id);

  const after = await prisma.octopusGoalkeeperBet.findMany({
    where: { matchId: match.id, cancelledAt: null },
    select: {
      points: true,
      user: { select: { username: true } },
      player: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const stats = await prisma.matchGoalkeeperStat.findMany({
    where: { matchId: match.id },
    select: { saves: true, source: true, player: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
  });

  console.log(
    `[repair] match: ${match.homeTeam.name} ${match.homeScore}-${match.awayScore} ${match.awayTeam.name} (${match.matchTime.toISOString()})`
  );
  console.log(`[repair] source: ${SOURCE}`);
  console.log(`[repair] stat: ${alisson.name} saves=${SAVES}`);
  console.log("[repair] affected octopus bets:");
  for (const row of after) {
    const old = before.find(
      (item) => item.username === row.user.username && item.player === row.player.name
    );
    const delta = row.points - (old?.points ?? 0);
    console.log(
      `- ${row.user.username}: ${row.player.name}, ${old?.points ?? 0} -> ${row.points} (${delta >= 0 ? "+" : ""}${delta})`
    );
  }
  console.log("[repair] goalkeeper stats:");
  for (const stat of stats) {
    console.log(`- ${stat.player.name}: saves=${stat.saves}, source=${stat.source}`);
  }

  await purgeLeaderboardCache();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
