import { PrismaClient } from "@prisma/client";
import {
  recalculateMatchScoring,
  submitMatchPredictionBundle,
} from "../src/services/prediction.service";
import { calculateOctopusPointsForMatch } from "../src/services/octopus-bet.service";
import { getRoundUsageLimits } from "../src/services/round-usage.service";
import { getOverallLeaderboard } from "../src/services/leaderboard.service";
import {
  getUserTotalPoints,
  invalidateUserTotalPointsCache,
} from "../src/services/user-points.service";

const prisma = new PrismaClient();
const stamp = `codex_score_${Date.now().toString(36)}`;

const created = {
  users: [] as string[],
  rounds: [] as string[],
  teams: [] as string[],
  players: [] as string[],
  matches: [] as string[],
};

let failures = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (!condition) {
    failures += 1;
    console.error(`FAIL: ${name}${detail ? ` (${detail})` : ""}`);
    return;
  }
  console.log(`PASS: ${name}`);
}

async function cleanup() {
  await prisma.octopusGoalkeeperBet.deleteMany({
    where: { OR: [{ userId: { in: created.users } }, { matchId: { in: created.matches } }] },
  });
  await prisma.boldScorerBet.deleteMany({
    where: { OR: [{ userId: { in: created.users } }, { matchId: { in: created.matches } }] },
  });
  await prisma.scorerPrediction.deleteMany({
    where: { OR: [{ userId: { in: created.users } }, { matchId: { in: created.matches } }] },
  });
  await prisma.prediction.deleteMany({
    where: { OR: [{ userId: { in: created.users } }, { matchId: { in: created.matches } }] },
  });
  await prisma.matchScorer.deleteMany({
    where: { matchId: { in: created.matches } },
  });
  await prisma.matchGoalkeeperStat.deleteMany({
    where: { matchId: { in: created.matches } },
  });
  await prisma.match.deleteMany({ where: { id: { in: created.matches } } });
  await prisma.player.deleteMany({ where: { id: { in: created.players } } });
  await prisma.team.deleteMany({ where: { id: { in: created.teams } } });
  await prisma.user.deleteMany({ where: { id: { in: created.users } } });
  await prisma.round.deleteMany({ where: { id: { in: created.rounds } } });
  invalidateUserTotalPointsCache();
}

async function createUser(username: string) {
  const user = await prisma.user.create({
    data: { username, passwordHash: "codex-qa" },
  });
  created.users.push(user.id);
  return user;
}

async function createMatch(data: {
  roundId: string;
  homeTeamId: string;
  awayTeamId: string;
  matchTime: Date;
  status?: "SCHEDULED" | "LIVE" | "FINISHED";
  isKnockout?: boolean;
  stageName?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
  actualFinishType?: "NINETY_MINUTES" | "EXTRA_TIME" | "PENALTIES" | null;
  penaltyWinnerTeamId?: string | null;
}) {
  const match = await prisma.match.create({
    data: {
      roundId: data.roundId,
      homeTeamId: data.homeTeamId,
      awayTeamId: data.awayTeamId,
      matchTime: data.matchTime,
      status: data.status ?? "SCHEDULED",
      isKnockout: data.isKnockout ?? false,
      stageName: data.stageName ?? null,
      homeScore: data.homeScore ?? null,
      awayScore: data.awayScore ?? null,
      actualFinishType: data.actualFinishType ?? null,
      penaltyWinnerTeamId: data.penaltyWinnerTeamId ?? null,
    },
  });
  created.matches.push(match.id);
  return match;
}

async function assertUserTotal(username: string, userId: string, expected: number) {
  invalidateUserTotalPointsCache(userId);
  const total = await getUserTotalPoints(userId);
  check(`${username} user total`, total === expected, `expected ${expected}, got ${total}`);

  const leaderboard = await getOverallLeaderboard({ withTrend: false, fresh: true });
  const row = leaderboard.find((entry) => entry.userId === userId);
  check(
    `${username} leaderboard total`,
    row?.points === expected,
    `expected ${expected}, got ${row?.points ?? "missing"}`
  );
}

async function main() {
  const round = await prisma.round.create({
    data: {
      name: `${stamp} round`,
      startsAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      endsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
  created.rounds.push(round.id);

  const [homeTeam, awayTeam] = await Promise.all([
    prisma.team.create({
      data: {
        name: `${stamp} Home`,
        shortName: "CDH",
        apiTeamId: `${stamp}-home`,
      },
    }),
    prisma.team.create({
      data: {
        name: `${stamp} Away`,
        shortName: "CDA",
        apiTeamId: `${stamp}-away`,
      },
    }),
  ]);
  created.teams.push(homeTeam.id, awayTeam.id);

  const [homeForward, awayForward, homeGoalkeeper] = await Promise.all([
    prisma.player.create({
      data: { teamId: homeTeam.id, name: `${stamp} Home Forward`, position: "Attacker" },
    }),
    prisma.player.create({
      data: { teamId: awayTeam.id, name: `${stamp} Away Forward`, position: "Attacker" },
    }),
    prisma.player.create({
      data: { teamId: homeTeam.id, name: `${stamp} Home Keeper`, position: "Goalkeeper" },
    }),
  ]);
  created.players.push(homeForward.id, awayForward.id, homeGoalkeeper.id);

  const [
    perfectUser,
    extraUser,
    penaltyUser,
    qfUser,
    r16User,
    r16OtherFeatureUser,
    octopusUser,
  ] =
    await Promise.all([
      createUser(`${stamp}_perfect`),
      createUser(`${stamp}_extra`),
      createUser(`${stamp}_penalty`),
      createUser(`${stamp}_qf`),
      createUser(`${stamp}_r16`),
      createUser(`${stamp}_r16_other_feature`),
      createUser(`${stamp}_octopus`),
    ]);

  const seedMatch = await createMatch({
    roundId: round.id,
    homeTeamId: homeTeam.id,
    awayTeamId: awayTeam.id,
    matchTime: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
    status: "FINISHED",
    homeScore: 1,
    awayScore: 0,
  });
  await prisma.prediction.createMany({
    data: [qfUser.id, r16User.id, r16OtherFeatureUser.id].map((userId) => ({
      userId,
      matchId: seedMatch.id,
      predHome: 1,
      predAway: 0,
      points: 5,
    })),
  });

  const perfectMatch = await createMatch({
    roundId: round.id,
    homeTeamId: homeTeam.id,
    awayTeamId: awayTeam.id,
    matchTime: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    status: "FINISHED",
    homeScore: 2,
    awayScore: 1,
  });
  await prisma.prediction.create({
    data: {
      userId: perfectUser.id,
      matchId: perfectMatch.id,
      predHome: 2,
      predAway: 1,
    },
  });
  await prisma.scorerPrediction.createMany({
    data: [
      { userId: perfectUser.id, matchId: perfectMatch.id, playerId: homeForward.id, predictedGoals: 2 },
      { userId: perfectUser.id, matchId: perfectMatch.id, playerId: awayForward.id, predictedGoals: 1 },
    ],
  });
  await prisma.matchScorer.createMany({
    data: [
      { matchId: perfectMatch.id, playerId: homeForward.id, goals: 2, minute: 20 },
      { matchId: perfectMatch.id, playerId: awayForward.id, goals: 1, minute: 55 },
    ],
  });
  await recalculateMatchScoring(perfectMatch.id);
  const perfectPrediction = await prisma.prediction.findUniqueOrThrow({
    where: { userId_matchId: { userId: perfectUser.id, matchId: perfectMatch.id } },
  });
  const perfectScorers = await prisma.scorerPrediction.aggregate({
    where: { userId: perfectUser.id, matchId: perfectMatch.id },
    _sum: { points: true },
  });
  check("perfect score stores 5+3 prediction points", perfectPrediction.points === 8);
  check("perfect score stores scorer points", perfectScorers._sum.points === 3);
  await assertUserTotal(perfectUser.username, perfectUser.id, 11);

  const extraMatch = await createMatch({
    roundId: round.id,
    homeTeamId: homeTeam.id,
    awayTeamId: awayTeam.id,
    matchTime: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
    status: "FINISHED",
    isKnockout: true,
    stageName: "Round of 16",
    homeScore: 2,
    awayScore: 1,
    actualFinishType: "EXTRA_TIME",
  });
  await prisma.prediction.create({
    data: {
      userId: extraUser.id,
      matchId: extraMatch.id,
      predHome: 2,
      predAway: 1,
      predictedFinishType: "EXTRA_TIME",
    },
  });
  await recalculateMatchScoring(extraMatch.id);
  const extraPrediction = await prisma.prediction.findUniqueOrThrow({
    where: { userId_matchId: { userId: extraUser.id, matchId: extraMatch.id } },
  });
  check("extra time stores exact score points", extraPrediction.points === 5);
  check("extra time stores finish-type points", extraPrediction.finishTypePoints === 2);
  await assertUserTotal(extraUser.username, extraUser.id, 7);

  const penaltyMatch = await createMatch({
    roundId: round.id,
    homeTeamId: homeTeam.id,
    awayTeamId: awayTeam.id,
    matchTime: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    status: "FINISHED",
    isKnockout: true,
    stageName: "Round of 16",
    homeScore: 1,
    awayScore: 1,
    actualFinishType: "PENALTIES",
    penaltyWinnerTeamId: homeTeam.id,
  });
  await prisma.prediction.create({
    data: {
      userId: penaltyUser.id,
      matchId: penaltyMatch.id,
      predHome: 1,
      predAway: 1,
      predictedFinishType: "PENALTIES",
      predictedPenaltyWinnerTeamId: homeTeam.id,
    },
  });
  await prisma.scorerPrediction.createMany({
    data: [
      { userId: penaltyUser.id, matchId: penaltyMatch.id, playerId: homeForward.id, predictedGoals: 1 },
      { userId: penaltyUser.id, matchId: penaltyMatch.id, playerId: awayForward.id, predictedGoals: 1 },
    ],
  });
  await prisma.matchScorer.createMany({
    data: [
      { matchId: penaltyMatch.id, playerId: homeForward.id, goals: 1, minute: 40 },
      { matchId: penaltyMatch.id, playerId: awayForward.id, goals: 1, minute: 80 },
    ],
  });
  await recalculateMatchScoring(penaltyMatch.id);
  const penaltyPrediction = await prisma.prediction.findUniqueOrThrow({
    where: { userId_matchId: { userId: penaltyUser.id, matchId: penaltyMatch.id } },
  });
  const penaltyScorers = await prisma.scorerPrediction.aggregate({
    where: { userId: penaltyUser.id, matchId: penaltyMatch.id },
    _sum: { points: true },
  });
  check("penalties store exact+perfect points", penaltyPrediction.points === 8);
  check("penalties store finish-type points", penaltyPrediction.finishTypePoints === 4);
  check("penalties store winner points", penaltyPrediction.penaltyWinnerPoints === 1);
  check("penalties store scorer points", penaltyScorers._sum.points === 2);
  await assertUserTotal(penaltyUser.username, penaltyUser.id, 15);

  const octopusMatch = await createMatch({
    roundId: round.id,
    homeTeamId: homeTeam.id,
    awayTeamId: awayTeam.id,
    matchTime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    status: "FINISHED",
    homeScore: 0,
    awayScore: 0,
  });
  await prisma.octopusGoalkeeperBet.create({
    data: {
      userId: octopusUser.id,
      roundId: round.id,
      usageRoundKey: `${round.id}:qa-octopus`,
      matchId: octopusMatch.id,
      playerId: homeGoalkeeper.id,
    },
  });
  await prisma.matchGoalkeeperStat.create({
    data: {
      matchId: octopusMatch.id,
      playerId: homeGoalkeeper.id,
      saves: 5,
      source: "manual-source:codex-qa",
    },
  });
  await recalculateMatchScoring(octopusMatch.id);
  const octopusBet = await prisma.octopusGoalkeeperBet.findFirstOrThrow({
    where: { userId: octopusUser.id, matchId: octopusMatch.id },
  });
  check("octopus points are stored", octopusBet.points === 6, `got ${octopusBet.points}`);
  await assertUserTotal(octopusUser.username, octopusUser.id, 6);

  const liveOctopusMatch = await createMatch({
    roundId: round.id,
    homeTeamId: homeTeam.id,
    awayTeamId: awayTeam.id,
    matchTime: new Date(Date.now() - 60 * 60 * 1000),
    status: "LIVE",
    homeScore: 0,
    awayScore: 0,
  });
  await prisma.octopusGoalkeeperBet.create({
    data: {
      userId: octopusUser.id,
      roundId: round.id,
      usageRoundKey: `${round.id}:qa-octopus-live`,
      matchId: liveOctopusMatch.id,
      playerId: homeGoalkeeper.id,
    },
  });
  await prisma.matchGoalkeeperStat.create({
    data: {
      matchId: liveOctopusMatch.id,
      playerId: homeGoalkeeper.id,
      saves: 5,
      source: "manual-source:codex-qa",
    },
  });
  await calculateOctopusPointsForMatch(liveOctopusMatch.id);
  const liveOctopusBet = await prisma.octopusGoalkeeperBet.findFirstOrThrow({
    where: { userId: octopusUser.id, matchId: liveOctopusMatch.id },
  });
  check(
    "live octopus with clean sheet stores save points only",
    liveOctopusBet.points === 3,
    `got ${liveOctopusBet.points}`
  );
  await prisma.match.update({
    where: { id: liveOctopusMatch.id },
    data: { status: "FINISHED" },
  });
  await calculateOctopusPointsForMatch(liveOctopusMatch.id);
  const finishedOctopusBet = await prisma.octopusGoalkeeperBet.findFirstOrThrow({
    where: { userId: octopusUser.id, matchId: liveOctopusMatch.id },
  });
  check(
    "finished octopus clean sheet adds bonus",
    finishedOctopusBet.points === 6,
    `got ${finishedOctopusBet.points}`
  );

  const qfMatch = await createMatch({
    roundId: round.id,
    homeTeamId: homeTeam.id,
    awayTeamId: awayTeam.id,
    matchTime: new Date(Date.now() + 6 * 60 * 60 * 1000),
    status: "SCHEDULED",
    isKnockout: true,
    stageName: "Quarter-finals",
  });
  await submitMatchPredictionBundle(qfUser.id, {
    matchId: qfMatch.id,
    predHome: 1,
    predAway: 0,
    isDouble: true,
    predictedFinishType: "NINETY_MINUTES",
    predictedPenaltyWinnerTeamId: null,
    picks: [{ playerId: homeForward.id, goals: 1 }],
    boldPlayerId: homeForward.id,
    octopusPlayerId: null,
  });
  const savedQf = await prisma.prediction.findUniqueOrThrow({
    where: { userId_matchId: { userId: qfUser.id, matchId: qfMatch.id } },
  });
  const savedQfBold = await prisma.boldScorerBet.findFirstOrThrow({
    where: { userId: qfUser.id, matchId: qfMatch.id },
  });
  check("quarter-final keeps double with bold", savedQf.isDouble && savedQfBold.cancelledAt == null);
  await prisma.match.update({
    where: { id: qfMatch.id },
    data: {
      status: "FINISHED",
      homeScore: 1,
      awayScore: 0,
      actualFinishType: "NINETY_MINUTES",
      matchTime: new Date(Date.now() - 60 * 60 * 1000),
    },
  });
  await prisma.matchScorer.create({
    data: { matchId: qfMatch.id, playerId: homeForward.id, goals: 1, minute: 30 },
  });
  await recalculateMatchScoring(qfMatch.id);
  const qfAfter = await prisma.prediction.findUniqueOrThrow({
    where: { userId_matchId: { userId: qfUser.id, matchId: qfMatch.id } },
  });
  const qfBoldAfter = await prisma.boldScorerBet.findFirstOrThrow({
    where: { userId: qfUser.id, matchId: qfMatch.id },
  });
  check("quarter-final double bonus includes card total", qfAfter.doubleBonus === 10);
  check("quarter-final bold bet is boosted to +10", qfBoldAfter.points === 10);
  await assertUserTotal(qfUser.username, qfUser.id, 35);

  const r16Match = await createMatch({
    roundId: round.id,
    homeTeamId: homeTeam.id,
    awayTeamId: awayTeam.id,
    matchTime: new Date(Date.now() + 7 * 60 * 60 * 1000),
    status: "SCHEDULED",
    isKnockout: true,
    stageName: "Round of 16",
  });
  let r16Rejected = false;
  try {
    await submitMatchPredictionBundle(r16User.id, {
      matchId: r16Match.id,
      predHome: 1,
      predAway: 0,
      isDouble: true,
      predictedFinishType: "NINETY_MINUTES",
      predictedPenaltyWinnerTeamId: null,
      picks: [{ playerId: homeForward.id, goals: 1 }],
      boldPlayerId: homeForward.id,
      octopusPlayerId: null,
    });
  } catch {
    r16Rejected = true;
  }
  check("round of 16 rejects double with bold", r16Rejected);

  await submitMatchPredictionBundle(r16User.id, {
    matchId: r16Match.id,
    predHome: 1,
    predAway: 0,
    isDouble: true,
    predictedFinishType: "NINETY_MINUTES",
    predictedPenaltyWinnerTeamId: null,
    picks: [{ playerId: homeForward.id, goals: 1 }],
    boldPlayerId: null,
    octopusPlayerId: null,
  });
  const savedR16 = await prisma.prediction.findUniqueOrThrow({
    where: { userId_matchId: { userId: r16User.id, matchId: r16Match.id } },
  });
  check("round of 16 accepts double without bold", savedR16.isDouble);

  const r16BoldElsewhereMatch = await createMatch({
    roundId: round.id,
    homeTeamId: homeTeam.id,
    awayTeamId: awayTeam.id,
    matchTime: new Date(Date.now() + 8 * 60 * 60 * 1000),
    status: "SCHEDULED",
    isKnockout: true,
    stageName: "Round of 16",
  });
  await submitMatchPredictionBundle(r16OtherFeatureUser.id, {
    matchId: r16BoldElsewhereMatch.id,
    predHome: 1,
    predAway: 0,
    isDouble: false,
    predictedFinishType: "NINETY_MINUTES",
    predictedPenaltyWinnerTeamId: null,
    picks: [{ playerId: homeForward.id, goals: 1 }],
    boldPlayerId: homeForward.id,
    octopusPlayerId: null,
  });
  const r16DoubleAfterBoldMatch = await createMatch({
    roundId: round.id,
    homeTeamId: homeTeam.id,
    awayTeamId: awayTeam.id,
    matchTime: new Date(Date.now() + 9 * 60 * 60 * 1000),
    status: "SCHEDULED",
    isKnockout: true,
    stageName: "Round of 16",
  });
  const r16DoubleLimits = await getRoundUsageLimits(
    r16OtherFeatureUser.id,
    r16DoubleAfterBoldMatch.id,
    round.id
  );
  check(
    "round of 16 double stays enabled when bold is on another match",
    r16DoubleLimits.doubles.canEnable,
    JSON.stringify(r16DoubleLimits.doubles)
  );
  await submitMatchPredictionBundle(r16OtherFeatureUser.id, {
    matchId: r16DoubleAfterBoldMatch.id,
    predHome: 1,
    predAway: 0,
    isDouble: true,
    predictedFinishType: "NINETY_MINUTES",
    predictedPenaltyWinnerTeamId: null,
    picks: [{ playerId: homeForward.id, goals: 1 }],
    boldPlayerId: null,
    octopusPlayerId: null,
  });
  const savedR16DoubleAfterBold = await prisma.prediction.findUniqueOrThrow({
    where: {
      userId_matchId: {
        userId: r16OtherFeatureUser.id,
        matchId: r16DoubleAfterBoldMatch.id,
      },
    },
  });
  check(
    "round of 16 accepts double when bold is on another match",
    savedR16DoubleAfterBold.isDouble
  );

  if (failures > 0) {
    throw new Error(`${failures} integration checks failed`);
  }
}

main()
  .catch((error) => {
    failures += 1;
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await cleanup();
      console.log(`Cleaned integration QA data for ${stamp}`);
    } finally {
      await prisma.$disconnect();
    }
  });
