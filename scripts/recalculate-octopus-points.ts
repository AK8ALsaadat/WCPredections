import { calculateOctopusPoints } from "../src/lib/octopus-points";
import { prisma } from "../src/lib/prisma";
import { calculateOctopusPointsForMatch } from "../src/services/octopus-bet.service";

type AuditRow = {
  id: string;
  userId: string;
  username: string;
  match: string;
  goalkeeper: string;
  before: number;
  expected: number;
  saves: number | null;
  goalsConceded: number | null;
};

function goalsConcededForTeam(match: {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
}, teamId: string) {
  if (teamId === match.homeTeamId) return match.awayScore;
  if (teamId === match.awayTeamId) return match.homeScore;
  return null;
}

async function auditActiveBets(): Promise<AuditRow[]> {
  const bets = await prisma.octopusGoalkeeperBet.findMany({
    where: { cancelledAt: null },
    include: {
      user: { select: { id: true, username: true } },
      player: { select: { id: true, name: true, teamId: true } },
      match: {
        select: {
          id: true,
          status: true,
          homeTeamId: true,
          awayTeamId: true,
          homeScore: true,
          awayScore: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      },
    },
    orderBy: [{ matchId: "asc" }, { userId: "asc" }],
  });

  const stats = await prisma.matchGoalkeeperStat.findMany({
    where: { matchId: { in: [...new Set(bets.map((bet) => bet.matchId))] } },
    select: { matchId: true, playerId: true, saves: true },
  });
  const savesByMatchPlayer = new Map(
    stats.map((stat) => [`${stat.matchId}:${stat.playerId}`, stat.saves])
  );

  const mismatches: AuditRow[] = [];
  for (const bet of bets) {
    const saves = savesByMatchPlayer.get(`${bet.matchId}:${bet.playerId}`) ?? null;
    const goalsConceded = goalsConcededForTeam(bet.match, bet.player.teamId);
    const expected =
      bet.match.status === "FINISHED" || saves != null
        ? calculateOctopusPoints(saves, goalsConceded, {
            includeCleanSheet: bet.match.status === "FINISHED",
          })
        : 0;

    if (bet.points !== expected) {
      mismatches.push({
        id: bet.id,
        userId: bet.user.id,
        username: bet.user.username,
        match: `${bet.match.homeTeam.name} vs ${bet.match.awayTeam.name}`,
        goalkeeper: bet.player.name,
        before: bet.points,
        expected,
        saves,
        goalsConceded,
      });
    }
  }

  return mismatches;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const activeMatchIds = await prisma.octopusGoalkeeperBet.findMany({
    where: { cancelledAt: null },
    distinct: ["matchId"],
    select: { matchId: true },
  });

  console.log(`[octopus] active matches with bets: ${activeMatchIds.length}`);
  for (const { matchId } of activeMatchIds) {
    await calculateOctopusPointsForMatch(matchId);
  }

  const mismatches = await auditActiveBets();
  if (mismatches.length > 0) {
    console.log(`[octopus] mismatches after recalculation: ${mismatches.length}`);
    for (const row of mismatches) {
      console.log(
        `- ${row.username}: ${row.match}, ${row.goalkeeper}, ${row.before} -> ${row.expected}, saves=${row.saves ?? "missing"}, conceded=${row.goalsConceded ?? "missing"}`
      );
    }

    if (!dryRun) {
      for (const row of mismatches) {
        await prisma.octopusGoalkeeperBet.update({
          where: { id: row.id },
          data: { points: row.expected },
        });
      }
      console.log(`[octopus] corrected active bets: ${mismatches.length}`);
    }
  } else {
    console.log("[octopus] all active bet points are already correct");
  }

  if (!dryRun) {
    const cleared = await prisma.octopusGoalkeeperBet.updateMany({
      where: { cancelledAt: { not: null }, points: { not: 0 } },
      data: { points: 0 },
    });
    console.log(`[octopus] cancelled bets reset to zero: ${cleared.count}`);
  }

  const remaining = await auditActiveBets();
  if (remaining.length > 0) {
    throw new Error(`[octopus] remaining mismatches: ${remaining.length}`);
  }
  console.log("[octopus] final audit passed");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
