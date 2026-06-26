import { prisma } from "../src/lib/prisma";
import { calculateOctopusPointsForMatch, syncGoalkeeperSavesFromApi } from "../src/services/octopus-bet.service";
import { recalculateMatchScoring } from "../src/services/prediction.service";
import { syncMatchScorersFromApi } from "../src/services/match-scorers.service";

type PointsSnapshot = Map<string, { username: string; points: number }>;

async function pointsSnapshot(): Promise<PointsSnapshot> {
  const [users, predictionGroups, scorerGroups, boldGroups, octopusGroups] =
    await Promise.all([
      prisma.user.findMany({ select: { id: true, username: true } }),
      prisma.prediction.groupBy({
        by: ["userId"],
        _sum: {
          points: true,
          doubleBonus: true,
          finishTypePoints: true,
          penaltyWinnerPoints: true,
        },
      }),
      prisma.scorerPrediction.groupBy({
        by: ["userId"],
        _sum: { points: true },
      }),
      prisma.boldScorerBet.groupBy({
        by: ["userId"],
        where: { cancelledAt: null },
        _sum: { points: true },
      }),
      prisma.octopusGoalkeeperBet.groupBy({
        by: ["userId"],
        where: { cancelledAt: null },
        _sum: { points: true },
      }),
    ]);

  const map: PointsSnapshot = new Map(
    users.map((user) => [user.id, { username: user.username, points: 0 }])
  );

  for (const group of predictionGroups) {
    const row = map.get(group.userId);
    if (!row) continue;
    row.points +=
      (group._sum.points ?? 0) +
      (group._sum.doubleBonus ?? 0) +
      (group._sum.finishTypePoints ?? 0) +
      (group._sum.penaltyWinnerPoints ?? 0);
  }
  for (const group of scorerGroups) {
    const row = map.get(group.userId);
    if (row) row.points += group._sum.points ?? 0;
  }
  for (const group of boldGroups) {
    const row = map.get(group.userId);
    if (row) row.points += group._sum.points ?? 0;
  }
  for (const group of octopusGroups) {
    const row = map.get(group.userId);
    if (row) row.points += group._sum.points ?? 0;
  }

  return map;
}

function diffSnapshots(before: PointsSnapshot, after: PointsSnapshot) {
  return Array.from(after.entries())
    .map(([userId, current]) => {
      const previous = before.get(userId)?.points ?? 0;
      return {
        userId,
        username: current.username,
        before: previous,
        after: current.points,
        delta: current.points - previous,
      };
    })
    .filter((row) => row.delta !== 0)
    .sort((a, b) => a.username.localeCompare(b.username));
}

async function scorerSnapshot(matchId: string) {
  const scorers = await prisma.matchScorer.findMany({
    where: { matchId },
    include: { player: { select: { name: true } } },
    orderBy: { playerId: "asc" },
  });
  return new Map(scorers.map((row) => [row.playerId, {
    goals: row.goals,
    name: row.player.name,
  }]));
}

async function octopusSnapshot() {
  const bets = await prisma.octopusGoalkeeperBet.findMany({
    where: { cancelledAt: null },
    include: {
      user: { select: { username: true } },
      player: { select: { name: true } },
      match: {
        select: {
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      },
    },
  });

  return new Map(
    bets.map((bet) => [bet.id, {
      points: bet.points,
      username: bet.user.username,
      player: bet.player.name,
      match: `${bet.match.homeTeam.name} vs ${bet.match.awayTeam.name}`,
    }])
  );
}

async function main() {
  const fullSync = process.argv.includes("--full-sync");
  const beforeTotals = await pointsSnapshot();
  const beforeOctopus = await octopusSnapshot();

  const suspiciousScorerRows = await prisma.$queryRaw<{ match_id: string }[]>`
    SELECT m.id AS match_id
    FROM matches m
    LEFT JOIN match_scorers ms ON ms.match_id = m.id
    WHERE m.status IN ('LIVE', 'FINISHED')
      AND m.home_score IS NOT NULL
      AND m.away_score IS NOT NULL
    GROUP BY m.id, m.home_score, m.away_score
    HAVING COALESCE(SUM(ms.goals), 0) > (m.home_score + m.away_score)
  `;
  const suspiciousMatchIds = new Set(
    suspiciousScorerRows.map((row) => row.match_id)
  );

  const matches = await prisma.match.findMany({
    where: {
      apiMatchId: { not: null },
      status: { in: ["LIVE", "FINISHED"] },
      ...(fullSync
        ? {
            OR: [
              { scorerPredictions: { some: {} } },
              { boldScorerBets: { some: { cancelledAt: null } } },
              { matchScorers: { some: {} } },
              { octopusBets: { some: { cancelledAt: null } } },
            ],
          }
        : {
            OR: [
              { id: { in: [...suspiciousMatchIds] } },
              { octopusBets: { some: { cancelledAt: null } } },
            ],
          }),
    },
    include: {
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
      octopusBets: { where: { cancelledAt: null }, select: { id: true } },
    },
    orderBy: { matchTime: "asc" },
  });

  const scorerCorrections: string[] = [];
  const syncErrors: string[] = [];

  for (const match of matches) {
    const label = `${match.homeTeam.name} vs ${match.awayTeam.name}`;
    const beforeScorers = await scorerSnapshot(match.id);

    if (fullSync || suspiciousMatchIds.has(match.id)) {
      try {
        await syncMatchScorersFromApi(match.id, match.apiMatchId!);
      } catch (err) {
        syncErrors.push(`${label}: scorers ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (match.octopusBets.length > 0) {
      try {
        await syncGoalkeeperSavesFromApi(match.id, match.apiMatchId!);
      } catch (err) {
        syncErrors.push(`${label}: saves ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    try {
      await recalculateMatchScoring(match.id);
    } catch (err) {
      syncErrors.push(`${label}: scoring ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    await calculateOctopusPointsForMatch(match.id);

    const afterScorers = await scorerSnapshot(match.id);
    for (const [playerId, before] of beforeScorers) {
      const after = afterScorers.get(playerId)?.goals ?? 0;
      if (after < before.goals) {
        scorerCorrections.push(
          `${label}: ${before.name} ${before.goals} -> ${after}`
        );
      }
    }
  }

  const afterOctopus = await octopusSnapshot();
  const afterTotals = await pointsSnapshot();
  const totalDeltas = diffSnapshots(beforeTotals, afterTotals);

  const octopusDeltas = Array.from(afterOctopus.entries())
    .map(([id, after]) => {
      const before = beforeOctopus.get(id);
      return {
        username: after.username,
        match: after.match,
        goalkeeper: after.player,
        before: before?.points ?? 0,
        after: after.points,
        delta: after.points - (before?.points ?? 0),
      };
    })
    .filter((row) => row.delta !== 0)
    .sort((a, b) => a.username.localeCompare(b.username));

  console.log(`[repair] checked matches: ${matches.length}`);

  console.log("[repair] scorer/offside corrections:");
  if (scorerCorrections.length === 0) {
    console.log("  none");
  } else {
    for (const row of scorerCorrections) console.log(`  - ${row}`);
  }

  console.log("[repair] octopus save-point deltas:");
  if (octopusDeltas.length === 0) {
    console.log("  none");
  } else {
    for (const row of octopusDeltas) {
      console.log(
        `  - ${row.username}: ${row.match}, ${row.goalkeeper}, ${row.before} -> ${row.after} (${row.delta >= 0 ? "+" : ""}${row.delta})`
      );
    }
  }

  console.log("[repair] user total point deltas:");
  if (totalDeltas.length === 0) {
    console.log("  none");
  } else {
    for (const row of totalDeltas) {
      console.log(
        `  - ${row.username}: ${row.before} -> ${row.after} (${row.delta >= 0 ? "+" : ""}${row.delta})`
      );
    }
  }

  if (syncErrors.length > 0) {
    console.log("[repair] sync warnings:");
    for (const row of syncErrors) console.log(`  - ${row}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
