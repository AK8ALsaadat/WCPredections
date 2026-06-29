import "dotenv/config";
import type { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { submitBoldScorerBet } from "../src/services/bold-scorer-bet.service";
import { submitOctopusBet } from "../src/services/octopus-bet.service";
import { submitMatchPredictionBundle } from "../src/services/prediction.service";
import { getUsageRoundScope } from "../src/services/usage-round.service";

const stamp = Date.now();
const tag = `qa_switch_${stamp}`;

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readState(userId: string, matchId: string, usageRoundKey: string) {
  const [prediction, bold, octopus] = await Promise.all([
    prisma.prediction.findUnique({
      where: { userId_matchId: { userId, matchId } },
      select: { isDouble: true },
    }),
    prisma.boldScorerBet.findUnique({
      where: { userId_usageRoundKey: { userId, usageRoundKey } },
      select: { matchId: true, playerId: true, cancelledAt: true },
    }),
    prisma.octopusGoalkeeperBet.findUnique({
      where: { userId_usageRoundKey: { userId, usageRoundKey } },
      select: { matchId: true, playerId: true, cancelledAt: true },
    }),
  ]);

  return { prediction, bold, octopus };
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
    const now = Date.now();
    const startsAt = new Date(now - 60 * 60 * 1000);
    const matchTime = new Date(now + 24 * 60 * 60 * 1000);
    const endsAt = new Date(now + 72 * 60 * 60 * 1000);

    const [round, home, away, user] = await prisma.$transaction([
      prisma.round.create({
        data: {
          name: `${tag} Round`,
          startsAt,
          endsAt,
        },
      }),
      prisma.team.create({
        data: {
          name: `${tag} Home`,
          shortName: "QAH",
          apiTeamId: `qa-home-${stamp}`,
        },
      }),
      prisma.team.create({
        data: {
          name: `${tag} Away`,
          shortName: "QAA",
          apiTeamId: `qa-away-${stamp}`,
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
        matchTime,
        status: "SCHEDULED",
        stageName: "Round of 16",
      },
    });
    created.matchId = match.id;

    const players = await prisma.player.createManyAndReturn({
      data: [
        {
          teamId: home.id,
          apiPlayerId: `${tag}-attacker-1`,
          name: "QA Attacker One",
          position: "Forward",
        },
        {
          teamId: home.id,
          apiPlayerId: `${tag}-attacker-2`,
          name: "QA Attacker Two",
          position: "Forward",
        },
        {
          teamId: home.id,
          apiPlayerId: `${tag}-gk-1`,
          name: "QA Keeper One",
          position: "Goalkeeper",
        },
        {
          teamId: away.id,
          apiPlayerId: `${tag}-gk-2`,
          name: "QA Keeper Two",
          position: "Goalkeeper",
        },
      ],
      select: { id: true, name: true },
    });
    created.playerIds.push(...players.map((player) => player.id));

    const attacker1 = players.find((player) => player.name === "QA Attacker One")!;
    const attacker2 = players.find((player) => player.name === "QA Attacker Two")!;
    const keeper1 = players.find((player) => player.name === "QA Keeper One")!;
    const keeper2 = players.find((player) => player.name === "QA Keeper Two")!;
    const usageRoundKey = (await getUsageRoundScope(match.id, round.id)).key;

    await prisma.prediction.create({
      data: {
        userId: user.id,
        matchId: match.id,
        predHome: 0,
        predAway: 0,
        points: 10,
      },
    });

    await submitMatchPredictionBundle(user.id, {
      matchId: match.id,
      predHome: 1,
      predAway: 0,
      isDouble: true,
      picks: [],
      boldPlayerId: null,
      octopusPlayerId: null,
    });
    let state = await readState(user.id, match.id, usageRoundKey);
    assert(state.prediction?.isDouble, "double should be active");

    await submitMatchPredictionBundle(user.id, {
      matchId: match.id,
      predHome: 1,
      predAway: 0,
      isDouble: false,
      picks: [{ playerId: attacker1.id, goals: 1 }],
      boldPlayerId: attacker1.id,
      octopusPlayerId: null,
    });
    state = await readState(user.id, match.id, usageRoundKey);
    assert(!state.prediction?.isDouble, "bundle should remove double before bold");
    assert(state.bold?.playerId === attacker1.id, "bundle should set bold player");
    assert(!state.octopus, "bundle should not leave octopus");

    await submitMatchPredictionBundle(user.id, {
      matchId: match.id,
      predHome: 1,
      predAway: 0,
      isDouble: false,
      picks: [{ playerId: attacker2.id, goals: 1 }],
      boldPlayerId: attacker2.id,
      octopusPlayerId: null,
    });
    state = await readState(user.id, match.id, usageRoundKey);
    assert(state.bold?.playerId === attacker2.id, "bundle should change bold player");

    await submitMatchPredictionBundle(user.id, {
      matchId: match.id,
      predHome: 0,
      predAway: 0,
      isDouble: false,
      picks: [],
      boldPlayerId: null,
      octopusPlayerId: keeper1.id,
    });
    state = await readState(user.id, match.id, usageRoundKey);
    assert(!state.bold, "bundle should remove bold before octopus");
    assert(state.octopus?.playerId === keeper1.id, "bundle should set octopus");

    await submitMatchPredictionBundle(user.id, {
      matchId: match.id,
      predHome: 0,
      predAway: 0,
      isDouble: false,
      picks: [],
      boldPlayerId: null,
      octopusPlayerId: keeper2.id,
    });
    state = await readState(user.id, match.id, usageRoundKey);
    assert(state.octopus?.playerId === keeper2.id, "bundle should change octopus");

    await submitMatchPredictionBundle(user.id, {
      matchId: match.id,
      predHome: 0,
      predAway: 0,
      isDouble: true,
      picks: [],
      boldPlayerId: null,
      octopusPlayerId: null,
    });
    state = await readState(user.id, match.id, usageRoundKey);
    assert(state.prediction?.isDouble, "bundle should set double again");
    assert(!state.bold && !state.octopus, "bundle should remove bets before double");

    await prisma.scorerPrediction.createMany({
      data: [
        { userId: user.id, matchId: match.id, playerId: attacker1.id, predictedGoals: 1 },
        { userId: user.id, matchId: match.id, playerId: attacker2.id, predictedGoals: 1 },
      ],
      skipDuplicates: true,
    });

    await submitBoldScorerBet(user.id, match.id, attacker1.id);
    state = await readState(user.id, match.id, usageRoundKey);
    assert(!state.prediction?.isDouble, "standalone bold should remove double");
    assert(state.bold?.playerId === attacker1.id, "standalone bold should be active");

    await submitOctopusBet(user.id, match.id, keeper1.id);
    state = await readState(user.id, match.id, usageRoundKey);
    assert(!state.bold, "standalone octopus should remove same-match bold");
    assert(state.octopus?.playerId === keeper1.id, "standalone octopus should be active");

    await submitBoldScorerBet(user.id, match.id, attacker2.id);
    state = await readState(user.id, match.id, usageRoundKey);
    assert(!state.octopus, "standalone bold should remove same-match octopus");
    assert(state.bold?.playerId === attacker2.id, "standalone bold should switch back");

    await submitBoldScorerBet(user.id, match.id, null);
    state = await readState(user.id, match.id, usageRoundKey);
    assert(!state.bold, "standalone bold removal should delete the bet");

    await submitOctopusBet(user.id, match.id, keeper2.id);
    await submitOctopusBet(user.id, match.id, null);
    state = await readState(user.id, match.id, usageRoundKey);
    assert(!state.octopus, "standalone octopus removal should delete the bet");

    console.log("Feature switching checks passed: double, bold, and octopus can be changed or removed before deadline.");
  } finally {
    const cleanup: Prisma.PrismaPromise<unknown>[] = [];
    if (created.userId) {
      cleanup.push(
        prisma.scorerPrediction.deleteMany({ where: { userId: created.userId } }),
        prisma.boldScorerBet.deleteMany({ where: { userId: created.userId } }),
        prisma.octopusGoalkeeperBet.deleteMany({ where: { userId: created.userId } }),
        prisma.prediction.deleteMany({ where: { userId: created.userId } })
      );
    }
    if (created.matchId) {
      cleanup.push(prisma.match.deleteMany({ where: { id: created.matchId } }));
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
    if (cleanup.length > 0) {
      await prisma.$transaction(cleanup);
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
