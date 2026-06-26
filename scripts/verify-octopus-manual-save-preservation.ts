import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { replaceGoalkeeperSaves } from "../src/services/octopus-bet.service";

const stamp = Date.now();
const tag = `qa_octopus_manual_${stamp}`;

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function main() {
  const created = {
    userId: "",
    roundId: "",
    matchId: "",
    teamIds: [] as string[],
    playerIds: [] as string[],
  };

  try {
    const [round, home, away, user] = await prisma.$transaction([
      prisma.round.create({
        data: {
          name: `${tag} Round`,
          startsAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
          endsAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        },
      }),
      prisma.team.create({
        data: {
          name: `${tag} Home`,
          shortName: "QOH",
          apiTeamId: `${tag}-home`,
        },
      }),
      prisma.team.create({
        data: {
          name: `${tag} Away`,
          shortName: "QOA",
          apiTeamId: `${tag}-away`,
        },
      }),
      prisma.user.create({
        data: {
          username: tag,
          passwordHash: "qa",
        },
      }),
    ]);

    created.userId = user.id;
    created.roundId = round.id;
    created.teamIds.push(home.id, away.id);

    const match = await prisma.match.create({
      data: {
        roundId: round.id,
        homeTeamId: home.id,
        awayTeamId: away.id,
        matchTime: new Date(Date.now() - 24 * 60 * 60 * 1000),
        status: "FINISHED",
        homeScore: 0,
        awayScore: 0,
        apiMatchId: `${tag}-fixture`,
      },
    });
    created.matchId = match.id;

    const [manualKeeper, apiKeeper] = await prisma.player.createManyAndReturn({
      data: [
        {
          teamId: home.id,
          apiPlayerId: `${tag}-manual-keeper`,
          name: "QA Manual Keeper",
          position: "Goalkeeper",
        },
        {
          teamId: away.id,
          apiPlayerId: `${tag}-api-keeper`,
          name: "QA Api Keeper",
          position: "Goalkeeper",
        },
      ],
      select: { id: true, name: true, apiPlayerId: true },
    });
    created.playerIds.push(manualKeeper.id, apiKeeper.id);

    await prisma.matchGoalkeeperStat.create({
      data: {
        matchId: match.id,
        playerId: manualKeeper.id,
        saves: 3,
        source: "manual-source:qa-preserve",
      },
    });

    await prisma.octopusGoalkeeperBet.create({
      data: {
        userId: user.id,
        roundId: round.id,
        usageRoundKey: `${round.id}:group-gameweek:1`,
        matchId: match.id,
        playerId: manualKeeper.id,
        points: 4,
      },
    });

    const count = await replaceGoalkeeperSaves(
      match.id,
      [
        {
          playerApiId: manualKeeper.apiPlayerId!,
          playerName: manualKeeper.name,
          teamApiId: home.apiTeamId!,
          teamName: home.name,
          saves: 0,
        },
        {
          playerApiId: apiKeeper.apiPlayerId!,
          playerName: apiKeeper.name,
          teamApiId: away.apiTeamId!,
          teamName: away.name,
          saves: 2,
        },
      ],
      {
        matchTime: match.matchTime,
        roundId: match.roundId,
        homeTeam: { id: home.id, apiTeamId: home.apiTeamId, name: home.name },
        awayTeam: { id: away.id, apiTeamId: away.apiTeamId, name: away.name },
      }
    );

    assert(count === 2, "replaceGoalkeeperSaves should resolve both API keepers");

    const [manualStat, apiStat, bet] = await Promise.all([
      prisma.matchGoalkeeperStat.findUnique({
        where: {
          matchId_playerId: { matchId: match.id, playerId: manualKeeper.id },
        },
      }),
      prisma.matchGoalkeeperStat.findUnique({
        where: {
          matchId_playerId: { matchId: match.id, playerId: apiKeeper.id },
        },
      }),
      prisma.octopusGoalkeeperBet.findFirst({
        where: { userId: user.id, matchId: match.id },
      }),
    ]);

    assert(manualStat?.saves === 3, "manual saves must not be overwritten");
    assert(
      manualStat?.source === "manual-source:qa-preserve",
      "manual source must be preserved"
    );
    assert(apiStat?.saves === 2, "API keeper saves should still be stored");
    assert(bet?.points === 4, "octopus points should stay based on manual saves");

    console.log("Octopus manual save preservation passed.");
  } finally {
    const cleanup = [];
    if (created.userId) {
      cleanup.push(
        prisma.octopusGoalkeeperBet.deleteMany({ where: { userId: created.userId } }),
        prisma.prediction.deleteMany({ where: { userId: created.userId } }),
        prisma.scorerPrediction.deleteMany({ where: { userId: created.userId } })
      );
    }
    if (created.matchId) {
      cleanup.push(
        prisma.matchGoalkeeperStat.deleteMany({ where: { matchId: created.matchId } }),
        prisma.match.deleteMany({ where: { id: created.matchId } })
      );
    }
    if (created.playerIds.length > 0) {
      cleanup.push(prisma.player.deleteMany({ where: { id: { in: created.playerIds } } }));
    }
    if (created.teamIds.length > 0) {
      cleanup.push(prisma.team.deleteMany({ where: { id: { in: created.teamIds } } }));
    }
    if (created.roundId) {
      cleanup.push(prisma.round.deleteMany({ where: { id: created.roundId } }));
    }
    if (created.userId) {
      cleanup.push(prisma.user.deleteMany({ where: { id: created.userId } }));
    }
    if (cleanup.length > 0) await prisma.$transaction(cleanup);
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
