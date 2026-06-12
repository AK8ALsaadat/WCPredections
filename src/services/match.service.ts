import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  getMatchCalendarDay,
  isWithinLineupFastRefreshWindow,
} from "@/lib/utils";
import { getTournamentRoundName } from "@/lib/rounds";
import type { MatchStatus } from "@prisma/client";
import { getBoldScorerBetStatus } from "@/services/bold-scorer-bet.service";
import { recalculateMatchScoring } from "@/services/prediction.service";
import { getRoundUsageLimits } from "@/services/round-usage.service";

const teamSelect = {
  id: true,
  name: true,
  shortName: true,
  logoUrl: true,
} as const;

export async function enrichMatchesWithUserPredictions<
  T extends { id: string },
>(matches: T[], userId?: string) {
  if (!userId || matches.length === 0) {
    return matches.map((match) => ({
      ...match,
      userPrediction: null,
      userScorerPredictions: [] as {
        predictedGoals: number;
        points: number;
        player: { id: string; name: string; teamId: string };
      }[],
      userBoldScorerBet: null,
    }));
  }

  const matchIds = matches.map((m) => m.id);
  const [predictions, scorerPredictions, boldScorerBets] = await Promise.all([
    prisma.prediction.findMany({
      where: { userId, matchId: { in: matchIds } },
      select: {
        matchId: true,
        predHome: true,
        predAway: true,
        isDouble: true,
        points: true,
        finishTypePoints: true,
        penaltyWinnerPoints: true,
        predictedFinishType: true,
        predictedPenaltyWinnerTeamId: true,
      },
    }),
    prisma.scorerPrediction.findMany({
      where: { userId, matchId: { in: matchIds } },
      select: {
        matchId: true,
        predictedGoals: true,
        points: true,
        player: { select: { id: true, name: true, teamId: true, position: true } },
      },
    }),
    prisma.boldScorerBet.findMany({
      where: { userId, matchId: { in: matchIds } },
      select: {
        matchId: true,
        points: true,
        player: { select: { id: true, name: true } },
      },
    }),
  ]);

  const predictionByMatch = new Map(predictions.map((p) => [p.matchId, p]));
  const scorersByMatch = new Map<string, typeof scorerPredictions>();
  const boldByMatch = new Map(
    boldScorerBets.map((b) => [
      b.matchId,
      { points: b.points, player: b.player },
    ])
  );

  for (const scorer of scorerPredictions) {
    const list = scorersByMatch.get(scorer.matchId) ?? [];
    list.push(scorer);
    scorersByMatch.set(scorer.matchId, list);
  }

  return matches.map((match) => ({
    ...match,
    userPrediction: predictionByMatch.get(match.id) ?? null,
    userScorerPredictions: scorersByMatch.get(match.id) ?? [],
    userBoldScorerBet: boldByMatch.get(match.id) ?? null,
  }));
}

async function fetchScheduleMatches(roundId?: string) {
  return prisma.match.findMany({
    where: {
      roundId: roundId ?? undefined,
    },
    include: {
      homeTeam: { select: teamSelect },
      awayTeam: { select: teamSelect },
      round: { select: { id: true, name: true } },
    },
    orderBy: { matchTime: "asc" },
  });
}

/** مباريات اليوم اللي المستخدم توقعها — تبقى ظاهرة حتى بعد إغلاق التوقع */
export async function getUserPinnedTodayMatches(
  userId: string,
  roundId?: string
) {
  const predictions = await prisma.prediction.findMany({
    where: {
      userId,
      match: {
        roundId: roundId ?? undefined,
        status: { notIn: ["CANCELLED"] },
      },
    },
    include: {
      match: {
        include: {
          homeTeam: { select: teamSelect },
          awayTeam: { select: teamSelect },
          round: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { match: { matchTime: "asc" } },
  });

const matches = predictions
  .map((p) => p.match)
  .sort(
    (a, b) =>
      new Date(b.matchTime).getTime() -
      new Date(a.matchTime).getTime()
  )
  .slice(0, 3);

const uniqueById = new Map(matches.map((m) => [m.id, m]));

return enrichMatchesWithUserPredictions(
  Array.from(uniqueById.values()),
  userId
);
}

export async function getScheduleMatches(roundId?: string) {
  return fetchScheduleMatches(roundId);
}

export async function getUpcomingMatches(roundId?: string) {
  return prisma.match.findMany({
    where: {
      roundId: roundId ?? undefined,
      status: { in: ["SCHEDULED", "LIVE"] },
      matchTime: { gte: new Date() },
    },
    include: {
      homeTeam: { select: teamSelect },
      awayTeam: { select: teamSelect },
      round: { select: { id: true, name: true } },
    },
    orderBy: { matchTime: "asc" },
  });
}

export async function getAllMatches(roundId?: string) {
  return prisma.match.findMany({
    where: { roundId: roundId ?? undefined },
    include: {
      homeTeam: { select: teamSelect },
      awayTeam: { select: teamSelect },
      round: { select: { id: true, name: true } },
    },
    orderBy: { matchTime: "asc" },
  });
}

const matchLineupCache = new Map<
  string,
  { data: Awaited<ReturnType<typeof buildMatchLineup>>; expiresAt: number }
>();
const MATCH_LINEUP_CACHE_MS = 5 * 60 * 1000;
const MATCH_LINEUP_PROBABLE_CACHE_MS = 45 * 1000;
const MATCH_SHELL_REVALIDATE_SECONDS = 60;
const MATCH_LINEUP_REVALIDATE_SECONDS = 300;
const MATCH_LINEUP_PROBABLE_REVALIDATE_SECONDS = 45;

async function fetchMatchShell(matchId: string) {
  return prisma.match.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      matchTime: true,
      isKnockout: true,
      roundId: true,
      homeTeam: { select: teamSelect },
      awayTeam: { select: teamSelect },
    },
  });
}

function getCachedMatchShell(matchId: string) {
  return unstable_cache(
    () => fetchMatchShell(matchId),
    ["match-shell", matchId],
    { revalidate: MATCH_SHELL_REVALIDATE_SECONDS, tags: [`match-${matchId}`] }
  )();
}

async function buildMatchLineup(matchId: string) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      apiMatchId: true,
      matchTime: true,
      homeTeamId: true,
      awayTeamId: true,
      homeTeam: { select: { apiTeamId: true, name: true, shortName: true } },
      awayTeam: { select: { apiTeamId: true, name: true, shortName: true } },
    },
  });

  if (!match) return null;

  const { getMatchPlayersFromApi } = await import(
    "@/services/match-players.service"
  );
  const playersData = await getMatchPlayersFromApi(match);

  return {
    homePlayers: playersData.home.players,
    awayPlayers: playersData.away.players,
    homeFormation: playersData.home.formation,
    awayFormation: playersData.away.formation,
    homeLineupSource: playersData.home.source,
    awayLineupSource: playersData.away.source,
    lineupStatus: playersData.lineupStatus,
    homeTeamName: match.homeTeam.name,
    awayTeamName: match.awayTeam.name,
    homeShortName: match.homeTeam.shortName,
    awayShortName: match.awayTeam.shortName,
  };
}

function getCachedMatchLineup(matchId: string, probable = false) {
  return unstable_cache(
    () => buildMatchLineup(matchId),
    ["match-lineup", matchId, probable ? "probable" : "default"],
    {
      revalidate: probable
        ? MATCH_LINEUP_PROBABLE_REVALIDATE_SECONDS
        : MATCH_LINEUP_REVALIDATE_SECONDS,
      tags: [`lineup-${matchId}`],
    }
  )();
}

export function clearMatchLineupMemoryCache(matchId: string) {
  matchLineupCache.delete(matchId);
}

export async function getMatchLineup(
  matchId: string,
  options?: { fresh?: boolean }
) {
  if (options?.fresh) {
    clearMatchLineupMemoryCache(matchId);
    const { invalidateCacheKey } = await import("@/lib/api-cache");
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      select: { apiMatchId: true },
    });
    if (match?.apiMatchId) {
      invalidateCacheKey(`fd:/matches/${match.apiMatchId}:unfold`);
    }
    return buildMatchLineup(matchId);
  }

  const hit = matchLineupCache.get(matchId);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.data;
  }

  const shell = await prisma.match.findUnique({
    where: { id: matchId },
    select: { matchTime: true },
  });
  const nearKickoff =
    shell?.matchTime && isWithinLineupFastRefreshWindow(shell.matchTime);

  const data = await getCachedMatchLineup(matchId, Boolean(nearKickoff));
  if (data) {
    const ttl =
      data.lineupStatus === "official"
        ? 3 * 60 * 1000
        : nearKickoff
          ? MATCH_LINEUP_PROBABLE_CACHE_MS
          : MATCH_LINEUP_CACHE_MS;
    matchLineupCache.set(matchId, {
      data,
      expiresAt: Date.now() + ttl,
    });
  }

  return data;
}

/** بيانات خفيفة لصفحة التوقع — بدون أهداف المباراة أو التشكيلة */
export async function getMatchByIdForPredict(matchId: string, userId?: string) {
  const [match, liveMeta] = await Promise.all([
    getCachedMatchShell(matchId),
    prisma.match.findUnique({
      where: { id: matchId },
      select: { status: true },
    }),
  ]);
  if (!match) return null;

  let userPrediction = null;
  let userScorerPredictions: { playerId: string; predictedGoals: number }[] = [];
  let userBoldScorerBet = null;
  let boldScorerRoundStatus = null;
  let roundUsageLimits = null;

  if (userId) {
    const [prediction, scorers, boldStatus, limits] = await Promise.all([
      prisma.prediction.findUnique({
        where: { userId_matchId: { userId, matchId } },
        select: {
          predHome: true,
          predAway: true,
          isDouble: true,
          predictedFinishType: true,
          predictedPenaltyWinnerTeamId: true,
        },
      }),
      prisma.scorerPrediction.findMany({
        where: { userId, matchId },
        select: { playerId: true, predictedGoals: true },
      }),
      getBoldScorerBetStatus(userId, matchId, match.roundId),
      getRoundUsageLimits(userId, matchId, match.roundId),
    ]);
    userPrediction = prediction;
    userScorerPredictions = scorers;
    roundUsageLimits = limits;
    boldScorerRoundStatus = {
      used: boldStatus.used,
      onThisMatch: boldStatus.onThisMatch,
      onOtherMatch: boldStatus.onOtherMatch,
      otherMatchId: boldStatus.otherMatchId,
    };
    if (boldStatus.onThisMatch && boldStatus.bet) {
      userBoldScorerBet = {
        playerId: boldStatus.bet.playerId,
        points: boldStatus.bet.points,
        player: { name: boldStatus.bet.playerName },
      };
    }
  }

  return {
    ...match,
    status: liveMeta?.status ?? "SCHEDULED",
    userPrediction,
    userScorerPredictions,
    userBoldScorerBet,
    boldScorerRoundStatus,
    roundUsageLimits,
  };
}

export async function getMatchById(
  matchId: string,
  userId?: string,
  options?: { includeLineup?: boolean }
) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      homeTeam: { select: teamSelect },
      awayTeam: { select: teamSelect },
      penaltyWinnerTeam: { select: teamSelect },
      round: { select: { id: true, name: true } },
      matchScorers: {
        include: { player: { select: { id: true, name: true } } },
      },
    },
  });

  if (!match) return null;

  let userPrediction = null;
  let userScorerPredictions = null;
  let userBoldScorerBet = null;
  let boldScorerRoundStatus = null;
  let roundUsageLimits = null;

  if (userId) {
    const [prediction, scorers, boldStatus, limits] = await Promise.all([
      prisma.prediction.findUnique({
        where: { userId_matchId: { userId, matchId } },
      }),
      prisma.scorerPrediction.findMany({
        where: { userId, matchId },
        include: { player: true },
      }),
      getBoldScorerBetStatus(userId, matchId, match.roundId),
      getRoundUsageLimits(userId, matchId, match.roundId),
    ]);
    userPrediction = prediction;
    userScorerPredictions = scorers;
    roundUsageLimits = limits;
    boldScorerRoundStatus = {
      used: boldStatus.used,
      onThisMatch: boldStatus.onThisMatch,
      onOtherMatch: boldStatus.onOtherMatch,
      otherMatchId: boldStatus.otherMatchId,
    };
    if (boldStatus.onThisMatch && boldStatus.bet) {
      userBoldScorerBet = {
        playerId: boldStatus.bet.playerId,
        points: boldStatus.bet.points,
        player: { name: boldStatus.bet.playerName },
      };
    }
  }

  const base = {
    ...match,
    userPrediction,
    userScorerPredictions,
    userBoldScorerBet,
    boldScorerRoundStatus,
    roundUsageLimits,
  };

  if (!options?.includeLineup) return base;

  const lineup = await getMatchLineup(matchId);
  return { ...base, ...lineup };
}

export async function updateMatchResult(
  matchId: string,
  data: {
    homeScore?: number | null;
    awayScore?: number | null;
    status?: MatchStatus;
    isKnockout?: boolean;
    actualFinishType?: "NINETY_MINUTES" | "EXTRA_TIME" | "PENALTIES" | null;
    penaltyWinnerTeamId?: string | null;
    scorerPlayerIds?: string[];
  }
) {
  const match = await prisma.match.update({
    where: { id: matchId },
    data: {
      homeScore: data.homeScore,
      awayScore: data.awayScore,
      status: data.status,
      isKnockout: data.isKnockout,
      actualFinishType: data.actualFinishType,
      penaltyWinnerTeamId: data.penaltyWinnerTeamId,
    },
    include: {
      homeTeam: { select: teamSelect },
      awayTeam: { select: teamSelect },
      round: true,
    },
  });

  if (data.scorerPlayerIds) {
    await prisma.matchScorer.deleteMany({ where: { matchId } });
    if (data.scorerPlayerIds.length > 0) {
      await prisma.matchScorer.createMany({
        data: data.scorerPlayerIds.map((playerId) => ({
          matchId,
          playerId,
          goals: 1,
        })),
      });
    }
  }

  if (
    (match.status === "LIVE" || match.status === "FINISHED") &&
    match.homeScore !== null &&
    match.awayScore !== null
  ) {
    await recalculateMatchScoring(matchId);
  }

  return match;
}

export async function getRounds() {
  return prisma.round.findMany({
    orderBy: { startsAt: "desc" },
    include: {
      _count: { select: { matches: true } },
    },
  });
}

const getCachedTournamentRound = unstable_cache(
  async () =>
    prisma.round.findFirst({
      where: { name: getTournamentRoundName() },
      orderBy: { startsAt: "desc" },
      include: { _count: { select: { matches: true } } },
    }),
  ["tournament-round"],
  { revalidate: 300 }
);

export async function getTournamentRound() {
  return getCachedTournamentRound();
}

/** جولات فرعية داخل بطولة الاستراحة — ليست الجولة الرئيسية */
export async function getSubRounds() {
  const tournamentName = getTournamentRoundName();
  return prisma.round.findMany({
    where: { name: { not: tournamentName } },
    orderBy: { startsAt: "desc" },
    include: { _count: { select: { matches: true } } },
  });
}

/** @deprecated Use getSubRounds */
export const getGameweekRounds = getSubRounds;

export async function createRound(data: {
  name: string;
  startsAt: Date;
  endsAt: Date;
}) {
  return prisma.round.create({ data });
}

export async function getTeams() {
  return prisma.team.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { players: true } } },
  });
}

export async function createTeam(data: {
  name: string;
  shortName: string;
  logoUrl?: string | null;
  apiTeamId?: string | null;
}) {
  return prisma.team.create({ data });
}

export async function createPlayer(data: {
  teamId: string;
  name: string;
  apiPlayerId?: string | null;
}) {
  return prisma.player.create({ data });
}

export async function getPlayersByTeam(teamId: string) {
  return prisma.player.findMany({
    where: { teamId },
    orderBy: { name: "asc" },
  });
}
