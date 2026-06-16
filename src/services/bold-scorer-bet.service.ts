import { resolveScorerGoalsForPlayer } from "@/lib/player-matching";
import { prisma } from "@/lib/prisma";
import { getPredictionLockReason } from "@/lib/utils";
import {
  BOLD_SCORER_POINTS,
  calculateBoldScorerBetPoints,
} from "@/services/scoring.service";
import {
  getUsageRoundScope,
  type UsageRoundScope,
} from "@/services/usage-round.service";
import {
  getUserTotalPoints,
  MIN_POINTS_FOR_BOLD_SCORER_BET,
} from "@/services/user-points.service";

export { BOLD_SCORER_POINTS };

export async function getBoldScorerBetForUserRound(
  userId: string,
  usageRoundKey: string
) {
  return prisma.boldScorerBet.findUnique({
    where: { userId_usageRoundKey: { userId, usageRoundKey } },
    include: {
      player: { select: { id: true, name: true, teamId: true } },
      match: { select: { id: true, homeTeamId: true, awayTeamId: true } },
    },
  });
}

export async function getBoldScorerBetForMatch(userId: string, matchId: string) {
  let scope;
  try {
    scope = await getUsageRoundScope(matchId);
  } catch (err) {
    // fallback like in submitBoldScorerBet
    const match = await prisma.match.findUniqueOrThrow({ where: { id: matchId }, select: { id: true, roundId: true, homeTeamId: true, awayTeamId: true, matchTime: true, stageName: true } });
    const roundMatches = await prisma.match.findMany({ where: { roundId: match.roundId }, select: { id: true, roundId: true, homeTeamId: true, awayTeamId: true, matchTime: true, stageName: true } });
    const buildStageKey = (s) => (s ?? 'default').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const isGroup = (s) => buildStageKey(s).includes('group');
    const matchObj = { id: match.id, roundId: match.roundId, homeTeamId: match.homeTeamId, awayTeamId: match.awayTeamId, matchTime: match.matchTime, stageName: match.stageName };
    let key;
    if (!isGroup(matchObj.stageName)) {
      key = `${matchObj.roundId}:stage:${buildStageKey(matchObj.stageName)}`;
    } else {
      const prevMatchesForTeam = (teamId) =>
        roundMatches.filter((candidate) => buildStageKey(candidate.stageName).includes('group') && new Date(candidate.matchTime) < new Date(matchObj.matchTime) && (candidate.homeTeamId === teamId || candidate.awayTeamId === teamId)).length;
      const gameweek = Math.max(prevMatchesForTeam(matchObj.homeTeamId), prevMatchesForTeam(matchObj.awayTeamId)) + 1;
      key = `${matchObj.roundId}:group-gameweek:${gameweek}`;
    }
    const matchIds = roundMatches.filter((candidate) => {
      if (!isGroup(matchObj.stageName)) return `${candidate.roundId}:stage:${buildStageKey(candidate.stageName)}` === key;
      const prevMatchesForTeam = (teamId) =>
        roundMatches.filter((c) => buildStageKey(c.stageName).includes('group') && new Date(c.matchTime) < new Date(matchObj.matchTime) && (c.homeTeamId === teamId || c.awayTeamId === teamId)).length;
      const candidateGameweek = Math.max(prevMatchesForTeam(candidate.homeTeamId), prevMatchesForTeam(candidate.awayTeamId)) + 1;
      return `${candidate.roundId}:group-gameweek:${candidateGameweek}` === key;
    }).map((c) => c.id);
    scope = { key, matchIds, databaseRoundId: matchObj.roundId };
  }
  const bet = await getBoldScorerBetForUserRound(userId, scope.key);
  if (bet?.matchId === matchId) return bet;
  return null;
}

export async function getBoldScorerBetStatus(
  userId: string,
  matchId: string,
  knownScope?: UsageRoundScope
) {
  let scope = knownScope;
  if (!scope) {
    try {
      scope = await getUsageRoundScope(matchId);
    } catch (err) {
      const match = await prisma.match.findUniqueOrThrow({ where: { id: matchId }, select: { id: true, roundId: true, homeTeamId: true, awayTeamId: true, matchTime: true, stageName: true } });
      const roundMatches = await prisma.match.findMany({ where: { roundId: match.roundId }, select: { id: true, roundId: true, homeTeamId: true, awayTeamId: true, matchTime: true, stageName: true } });
      const buildStageKey = (s) => (s ?? 'default').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const isGroup = (s) => buildStageKey(s).includes('group');
      const matchObj = { id: match.id, roundId: match.roundId, homeTeamId: match.homeTeamId, awayTeamId: match.awayTeamId, matchTime: match.matchTime, stageName: match.stageName };
      let key;
      if (!isGroup(matchObj.stageName)) {
        key = `${matchObj.roundId}:stage:${buildStageKey(matchObj.stageName)}`;
      } else {
        const prevMatchesForTeam = (teamId) =>
          roundMatches.filter((candidate) => buildStageKey(candidate.stageName).includes('group') && new Date(candidate.matchTime) < new Date(matchObj.matchTime) && (candidate.homeTeamId === teamId || candidate.awayTeamId === teamId)).length;
        const gameweek = Math.max(prevMatchesForTeam(matchObj.homeTeamId), prevMatchesForTeam(matchObj.awayTeamId)) + 1;
        key = `${matchObj.roundId}:group-gameweek:${gameweek}`;
      }
      const matchIds = roundMatches.filter((candidate) => {
        if (!isGroup(matchObj.stageName)) return `${candidate.roundId}:stage:${buildStageKey(candidate.stageName)}` === key;
        const prevMatchesForTeam = (teamId) =>
          roundMatches.filter((c) => buildStageKey(c.stageName).includes('group') && new Date(c.matchTime) < new Date(matchObj.matchTime) && (c.homeTeamId === teamId || c.awayTeamId === teamId)).length;
        const candidateGameweek = Math.max(prevMatchesForTeam(candidate.homeTeamId), prevMatchesForTeam(candidate.awayTeamId)) + 1;
        return `${candidate.roundId}:group-gameweek:${candidateGameweek}` === key;
      }).map((c) => c.id);
      scope = { key, matchIds, databaseRoundId: matchObj.roundId };
    }
  }

  const existing = await getBoldScorerBetForUserRound(
    userId,
    scope.key
  );

  return {
    roundId: scope.key,
    used: !!existing,
    onThisMatch: existing?.matchId === matchId,
    onOtherMatch: !!existing && existing.matchId !== matchId,
    bet:
      existing?.matchId === matchId
        ? {
            playerId: existing.playerId,
            playerName: existing.player.name,
            points: existing.points,
          }
        : null,
    otherMatchId: existing && existing.matchId !== matchId ? existing.matchId : null,
  };
}

export async function submitBoldScorerBet(
  userId: string,
  matchId: string,
  playerId: string | null
) {
  const match = await prisma.match.findUniqueOrThrow({
    where: { id: matchId },
    select: {
      id: true,
      roundId: true,
      homeTeamId: true,
      awayTeamId: true,
      matchTime: true,
      status: true,
    },
  });

  const lockReason = getPredictionLockReason(match.matchTime, match.status);
  if (lockReason) {
    throw new Error(lockReason);
  }

  let scope;
  try {
    scope = await getUsageRoundScope(matchId, match.roundId);
  } catch (err) {
    // Fallback for non-Next runtime (scripts/tests) where unstable_cache may not be available.
    // Recompute the usage round scope directly using the same logic as usage-round.service.
    const roundMatches = await prisma.match.findMany({ where: { roundId: match.roundId }, select: { id: true, roundId: true, homeTeamId: true, awayTeamId: true, matchTime: true, stageName: true } });
    const buildStageKey = (s) => (s ?? 'default').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const isGroup = (s) => buildStageKey(s).includes('group');
    const matchObj = { id: match.id, roundId: match.roundId, homeTeamId: match.homeTeamId, awayTeamId: match.awayTeamId, matchTime: match.matchTime, stageName: match.stageName };
    let key;
    if (!isGroup(matchObj.stageName)) {
      key = `${matchObj.roundId}:stage:${buildStageKey(matchObj.stageName)}`;
    } else {
      const prevMatchesForTeam = (teamId) =>
        roundMatches.filter((candidate) =>
          buildStageKey(candidate.stageName).includes('group') && new Date(candidate.matchTime) < new Date(matchObj.matchTime) && (candidate.homeTeamId === teamId || candidate.awayTeamId === teamId)
        ).length;
      const gameweek = Math.max(prevMatchesForTeam(matchObj.homeTeamId), prevMatchesForTeam(matchObj.awayTeamId)) + 1;
      key = `${matchObj.roundId}:group-gameweek:${gameweek}`;
    }
    const matchIds = roundMatches.filter((candidate) => {
      if (!isGroup(matchObj.stageName)) return `${candidate.roundId}:stage:${buildStageKey(candidate.stageName)}` === key;
      const prevMatchesForTeam = (teamId) =>
        roundMatches.filter((c) => buildStageKey(c.stageName).includes('group') && new Date(c.matchTime) < new Date(matchObj.matchTime) && (c.homeTeamId === teamId || c.awayTeamId === teamId)).length;
      const candidateGameweek = Math.max(prevMatchesForTeam(candidate.homeTeamId), prevMatchesForTeam(candidate.awayTeamId)) + 1;
      return `${candidate.roundId}:group-gameweek:${candidateGameweek}` === key;
    }).map((c) => c.id);
    scope = { key, matchIds, databaseRoundId: match.roundId };
  }
  const existing = await prisma.boldScorerBet.findUnique({
    where: {
      userId_usageRoundKey: { userId, usageRoundKey: scope.key },
    },
  });

  // If no playerId is provided, treat as a cancellation request.
  if (!playerId) {
    if (!existing) return null;
    if (existing.matchId !== matchId) return null;

    // allow cancellation prior to lock (lockReason was checked above)
    await prisma.boldScorerBet.delete({ where: { id: existing.id } });
    return null;
  }

  if (!existing) {
    const totalPoints = await getUserTotalPoints(userId);
    if (totalPoints < MIN_POINTS_FOR_BOLD_SCORER_BET) {
      throw new Error(
        `You need at least ${MIN_POINTS_FOR_BOLD_SCORER_BET} points to use the scorer bet`
      );
    }
  }

  // Allow changing the selected player for the same match prior to lock.
  // Previously changing was disallowed; removing that restriction lets users switch
  // their bold scorer bet before the prediction lock (the lockReason check above prevents changes after kickoff).
  // No-op if the same player is selected.
  if (existing?.matchId === matchId && existing.playerId === playerId) {
    // unchanged - return existing record
    return existing;
  }

  const player = await prisma.player.findFirst({
    where: {
      id: playerId,
      teamId: { in: [match.homeTeamId, match.awayTeamId] },
    },
  });

  if (!player) {
    throw new Error("اختيار لاعب غير صالح للبطاقة الجريئة");
  }

  if (existing && existing.matchId !== matchId) {
    throw new Error(
      "استخدمت الرهان في مباراة ثانية هالجولة — مرة واحدة بس"
    );
  }

  return prisma.boldScorerBet.upsert({
    where: {
      userId_usageRoundKey: { userId, usageRoundKey: scope.key },
    },
    create: {
      userId,
      roundId: match.roundId,
      usageRoundKey: scope.key,
      matchId,
      playerId,
    },
    update: {
      matchId,
      playerId,
      points: 0,
    },
    include: {
      player: { select: { id: true, name: true } },
    },
  });
}

export async function calculateBoldScorerBetPointsForMatch(
  matchId: string,
  regulationGoalsByPlayer: Map<string, number>,
  actualScorers: {
    playerId: string;
    player: { name: string; teamId: string };
  }[] = []
) {
  const [match, bets] = await Promise.all([
    prisma.match.findUnique({
      where: { id: matchId },
      select: { status: true },
    }),
    prisma.boldScorerBet.findMany({
      where: { matchId },
      include: {
        player: { select: { name: true, teamId: true } },
      },
    }),
  ]);

  for (const bet of bets) {
    const regulationGoals =
      resolveScorerGoalsForPlayer(
        bet.playerId,
        bet.player,
        regulationGoalsByPlayer,
        actualScorers
      ) ?? 0;
    const points =
      match?.status === "FINISHED"
        ? calculateBoldScorerBetPoints(regulationGoals)
        : regulationGoals > 0
          ? BOLD_SCORER_POINTS
          : 0;
    await prisma.boldScorerBet.update({
      where: { id: bet.id },
      data: { points },
    });
  }
}
