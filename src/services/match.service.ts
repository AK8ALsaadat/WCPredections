/* eslint-disable @typescript-eslint/no-explicit-any */
import { revalidateTag, unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isPredictionAllowed } from "@/lib/utils";
import { getTournamentRoundName } from "@/lib/rounds";
import { canShowKnockoutFeatures, filterVisibleMatches } from "@/lib/tournament-gates";
import type { MatchStatus } from "@prisma/client";
import { recalculateMatchScoring } from "@/services/prediction.service";
import { getRoundUsageLimits } from "@/services/round-usage.service";

const teamSelect = {
  id: true,
  name: true,
  shortName: true,
  logoUrl: true,
} as const;

function slugifyTeamName(text: string) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function dedupeMatches<T extends { matchTime?: unknown; homeTeam?: unknown; awayTeam?: unknown; apiMatchId?: unknown }>(rows: T[]): T[] {
  if (!rows || rows.length <= 1) return rows;
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const homeName = String((r.homeTeam as any)?.name ?? "");
    const awayName = String((r.awayTeam as any)?.name ?? "");
    const key = `${slugifyTeamName(homeName)}|${slugifyTeamName(awayName)}|${new Date(
      (r.matchTime as any) ?? String(new Date())
    ).getTime()}`;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }
  const out: T[] = [];
  for (const [, arr] of groups) {
    if (arr.length === 1) {
      out.push(arr[0]);
      continue;
    }
    // Score candidates: prefer apiMatchId, then logo availability, then longer names
    arr.sort((a, b) => {
      const score = (x: any) =>
        (x.apiMatchId ? 100 : 0) +
        (((x.homeTeam?.logoUrl ? 1 : 0) + (x.awayTeam?.logoUrl ? 1 : 0)) as number) * 5 +
        (((x.homeTeam?.shortName?.length ?? 0) + (x.awayTeam?.shortName?.length ?? 0)) as number);
      return score(b) - score(a);
    });
    out.push(arr[0]);
  }
  // keep original ordering by matchTime
  out.sort((a, b) => new Date(String(a.matchTime)).getTime() - new Date(String(b.matchTime)).getTime());
  return out;
}

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
      userOctopusBet: null,
    }));
  }

  const matchIds = matches.map((m) => m.id);
  
  // استعلام محسّن: استخدم select محدود بدلاً من تحميل كل المعلومات
  const [predictions, scorerPredictions, boldScorerBets, octopusBets] =
    await Promise.all([
    prisma.prediction.findMany({
      where: { userId, matchId: { in: matchIds } },
      select: {
        matchId: true,
        predHome: true,
        predAway: true,
        isDouble: true,
        points: true,
        doubleBonus: true,
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
        playerId: true,
        player: {
          select: { id: true, name: true, teamId: true, position: true },
        },
      },
    }),
      prisma.boldScorerBet.findMany({
        where: { userId, matchId: { in: matchIds } },
        select: {
          matchId: true,
          points: true,
          playerId: true,
          player: { select: { id: true, name: true } },
        },
      }),
      prisma.octopusGoalkeeperBet.findMany({
        where: { userId, matchId: { in: matchIds } },
        select: {
          matchId: true,
          points: true,
          playerId: true,
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
  const octopusByMatch = new Map(
    octopusBets.map((b) => [
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
    userOctopusBet: octopusByMatch.get(match.id) ?? null,
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
  const select = {
    id: true,
    apiMatchId: true,
    roundId: true,
    homeTeamId: true,
    awayTeamId: true,
    matchTime: true,
    groupCode: true,
    stageName: true,
    status: true,
    isKnockout: true,
    homeScore: true,
    awayScore: true,
    actualFinishType: true,
    penaltyWinnerTeamId: true,
    homeTeam: { select: teamSelect },
    awayTeam: { select: teamSelect },
    round: { select: { id: true, name: true } },
    predictions: {
      where: { userId },
      select: {
        predHome: true,
        predAway: true,
        isDouble: true,
        points: true,
        doubleBonus: true,
        finishTypePoints: true,
        penaltyWinnerPoints: true,
        predictedFinishType: true,
        predictedPenaltyWinnerTeamId: true,
      },
    },
    scorerPredictions: {
      where: { userId },
      select: {
        predictedGoals: true,
        points: true,
        player: { select: { id: true, name: true, teamId: true } },
      },
    },
    boldScorerBets: {
      where: { userId },
      select: {
        points: true,
        player: { select: { name: true } },
      },
    },
    octopusBets: {
      where: { userId },
      select: {
        points: true,
        player: { select: { name: true } },
      },
    },
  } as const;
  const baseWhere = {
    roundId: roundId ?? undefined,
    predictions: { some: { userId } },
  } as const;

  const [activeRows, previousRows] = await Promise.all([
    prisma.match.findMany({
      where: {
        ...baseWhere,
        status: { in: ["LIVE", "SCHEDULED"] },
      },
      select,
      orderBy: { matchTime: "asc" },
      take: 8,
    }),
    prisma.match.findMany({
      where: {
        ...baseWhere,
        status: { notIn: ["CANCELLED", "LIVE", "SCHEDULED"] },
      },
      select,
      orderBy: { matchTime: "desc" },
      take: 8,
    }),
  ]);

  const rows = [...activeRows, ...previousRows];
  const statusPriority: Record<string, number> = {
    LIVE: 0,
    SCHEDULED: 1,
    FINISHED: 2,
    POSTPONED: 3,
  };

  return rows
    .map(({ predictions, scorerPredictions, boldScorerBets, octopusBets, ...match }) => ({
      ...match,
      userPrediction: predictions[0] ?? null,
      userScorerPredictions: scorerPredictions,
      userBoldScorerBet: boldScorerBets[0] ?? null,
      userOctopusBet: octopusBets[0] ?? null,
    }))
    .sort((a, b) => {
      const statusDiff =
        (statusPriority[a.status] ?? 4) - (statusPriority[b.status] ?? 4);
      if (statusDiff !== 0) return statusDiff;

      const aTime = new Date(a.matchTime).getTime();
      const bTime = new Date(b.matchTime).getTime();
      return a.status === "SCHEDULED" ? aTime - bTime : bTime - aTime;
    })
    .slice(0, 8);
}

export async function getScheduleMatches(roundId?: string) {
  const rows = await unstable_cache(
    () => fetchScheduleMatches(roundId),
    ["schedule-matches", roundId ?? "all"],
    { revalidate: 60, tags: ["matches-schedule"] }
  )();
  return filterVisibleMatches(rows);
}

export async function getUpcomingMatches(roundId?: string) {
  const rows = await unstable_cache(
    () =>
      prisma.match.findMany({
        where: {
          roundId: roundId ?? undefined,
          status: { in: ["SCHEDULED", "LIVE"] },
        },
        include: {
          homeTeam: { select: teamSelect },
          awayTeam: { select: teamSelect },
          round: { select: { id: true, name: true } },
        },
        orderBy: { matchTime: "asc" },
      }),
    ["upcoming-match-candidates", roundId ?? "all"],
    { revalidate: 60, tags: ["matches-schedule"] }
  )();
  const now = Date.now();
  // dedupe server-side to reduce client overhead
  const deduped = await filterVisibleMatches(dedupeMatches(rows));
  return deduped.filter(
    (match) =>
      match.status === "LIVE" ||
      (match.status === "SCHEDULED" &&
        new Date(match.matchTime).getTime() >= now)
  );
}

export async function getCompletedMatches(roundId?: string) {
  const rows = await unstable_cache(
    () =>
      (async () => {
        const rows = await prisma.match.findMany({
          where: {
            roundId: roundId ?? undefined,
            status: "FINISHED",
          },
          include: {
            homeTeam: { select: teamSelect },
            awayTeam: { select: teamSelect },
            round: { select: { id: true, name: true } },
          },
          orderBy: { matchTime: "desc" },
        });
        return dedupeMatches(rows);
      })(),
    ["completed-matches", roundId ?? "all"],
    { revalidate: 60, tags: ["matches-schedule"] }
  )();
  return filterVisibleMatches(rows);
}

export async function getAllMatches(roundId?: string) {
  const rows = await prisma.match.findMany({
    where: { roundId: roundId ?? undefined },
    include: {
      homeTeam: { select: teamSelect },
      awayTeam: { select: teamSelect },
      round: { select: { id: true, name: true } },
    },
    orderBy: { matchTime: "asc" },
  });
  return filterVisibleMatches(dedupeMatches(rows));
}

const matchLineupCache = new Map<
  string,
  { data: Awaited<ReturnType<typeof buildMatchLineup>>; expiresAt: number }
>();
const MATCH_LINEUP_CACHE_MS = 5 * 60 * 1000;
const MATCH_LINEUP_SHARED_CACHE_SECONDS = 5 * 60;
const MATCH_SHELL_REVALIDATE_SECONDS = 60;

async function fetchMatchShell(matchId: string) {
  return prisma.match.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      matchTime: true,
      status: true,
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
    ["match-shell-v2", matchId],
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

function getSharedMatchLineup(matchId: string) {
  return unstable_cache(
    () => buildMatchLineup(matchId),
    ["match-lineup-v12", matchId],
    {
      revalidate: MATCH_LINEUP_SHARED_CACHE_SECONDS,
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

  const data = await getSharedMatchLineup(matchId);

  if (data) {
    matchLineupCache.set(matchId, {
      data,
      expiresAt: Date.now() + MATCH_LINEUP_CACHE_MS,
    });
  }

  return data;
}

/** بيانات خفيفة لصفحة التوقع — بدون أهداف المباراة أو التشكيلة */
export async function getMatchByIdForPredict(matchId: string, userId?: string) {
  const match = await getCachedMatchShell(matchId);
  if (!match) return null;
  if (match.isKnockout && !(await canShowKnockoutFeatures())) return null;

  let userPrediction = null;
  let userScorerPredictions: { playerId: string; predictedGoals: number }[] = [];
  let userBoldScorerBet = null;
  let userOctopusBet = null;
  let boldScorerRoundStatus = null;
  let octopusRoundStatus = null;
  let roundUsageLimits = null;

  if (userId) {
    const [prediction, scorers, limits] = await Promise.all([
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
      getRoundUsageLimits(userId, matchId, match.roundId),
    ]);
    const boldStatus = limits.boldScorer;
    const octopusStatus = limits.octopus;
    userPrediction = prediction;
    userScorerPredictions = scorers;
    roundUsageLimits = limits;
    boldScorerRoundStatus = {
      used: boldStatus.used,
      onThisMatch: boldStatus.onThisMatch,
      onOtherMatch: boldStatus.onOtherMatch,
      otherMatchId: boldStatus.otherMatchId,
    };
    octopusRoundStatus = {
      used: octopusStatus.used,
      onThisMatch: octopusStatus.onThisMatch,
      onOtherMatch: octopusStatus.onOtherMatch,
      otherMatchId: octopusStatus.otherMatchId,
    };
    if (boldStatus.onThisMatch && boldStatus.playerId) {
      userBoldScorerBet = {
        playerId: boldStatus.playerId,
        points: boldStatus.points,
        player: { name: boldStatus.playerName ?? "" },
      };
    }
    if (octopusStatus.onThisMatch && octopusStatus.playerId) {
      userOctopusBet = {
        playerId: octopusStatus.playerId,
        points: octopusStatus.points,
        player: { name: octopusStatus.playerName ?? "" },
      };
    }
  }

  return {
    ...match,
    userPrediction,
    userScorerPredictions,
    userBoldScorerBet,
    userOctopusBet,
    boldScorerRoundStatus,
    octopusRoundStatus,
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
  if (match.isKnockout && !(await canShowKnockoutFeatures())) return null;

  let userPrediction = null;
  let userScorerPredictions = null;
  let userBoldScorerBet = null;
  let userOctopusBet = null;
  let boldScorerRoundStatus = null;
  let octopusRoundStatus = null;
  let roundUsageLimits = null;

  if (userId) {
    const predictionOpen = isPredictionAllowed(
      match.matchTime,
      match.status
    );
    const [prediction, scorers, limits, closedBoldBet, closedOctopusBet] = await Promise.all([
      prisma.prediction.findUnique({
        where: { userId_matchId: { userId, matchId } },
      }),
      prisma.scorerPrediction.findMany({
        where: { userId, matchId },
        include: { player: true },
      }),
      predictionOpen
        ? getRoundUsageLimits(userId, matchId, match.roundId)
        : Promise.resolve(null),
      predictionOpen
        ? Promise.resolve(null)
        : prisma.boldScorerBet.findFirst({
            where: { userId, matchId },
            select: {
              playerId: true,
              points: true,
              player: { select: { name: true } },
            },
          }),
      predictionOpen
        ? Promise.resolve(null)
        : prisma.octopusGoalkeeperBet.findFirst({
            where: { userId, matchId },
            select: {
              playerId: true,
              points: true,
              player: { select: { name: true } },
            },
          }),
    ]);
    userPrediction = prediction;
    userScorerPredictions = scorers;
    roundUsageLimits = limits;
    if (limits) {
      const boldStatus = limits.boldScorer;
      const octopusStatus = limits.octopus;
      boldScorerRoundStatus = {
        used: boldStatus.used,
        onThisMatch: boldStatus.onThisMatch,
        onOtherMatch: boldStatus.onOtherMatch,
        otherMatchId: boldStatus.otherMatchId,
      };
      octopusRoundStatus = {
        used: octopusStatus.used,
        onThisMatch: octopusStatus.onThisMatch,
        onOtherMatch: octopusStatus.onOtherMatch,
        otherMatchId: octopusStatus.otherMatchId,
      };
      if (boldStatus.onThisMatch && boldStatus.playerId) {
        userBoldScorerBet = {
          playerId: boldStatus.playerId,
          points: boldStatus.points,
          player: { name: boldStatus.playerName ?? "" },
        };
      }
      if (octopusStatus.onThisMatch && octopusStatus.playerId) {
        userOctopusBet = {
          playerId: octopusStatus.playerId,
          points: octopusStatus.points,
          player: { name: octopusStatus.playerName ?? "" },
        };
      }
    } else if (closedBoldBet) {
      userBoldScorerBet = {
        playerId: closedBoldBet.playerId,
        points: closedBoldBet.points,
        player: closedBoldBet.player,
      };
    }
    if (!limits && closedOctopusBet) {
      userOctopusBet = {
        playerId: closedOctopusBet.playerId,
        points: closedOctopusBet.points,
        player: closedOctopusBet.player,
      };
    }
  }

  const base = {
    ...match,
    userPrediction,
    userScorerPredictions,
    userBoldScorerBet,
    userOctopusBet,
    boldScorerRoundStatus,
    octopusRoundStatus,
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
  return unstable_cache(
    () =>
      prisma.round.findMany({
        orderBy: { startsAt: "desc" },
        include: {
          _count: { select: { matches: true } },
        },
      }),
    ["rounds"],
    { revalidate: 300, tags: ["rounds"] }
  )();
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
  return unstable_cache(
    () =>
      prisma.round.findMany({
        where: { name: { not: tournamentName } },
        orderBy: { startsAt: "desc" },
        include: { _count: { select: { matches: true } } },
      }),
    ["sub-rounds"],
    { revalidate: 300, tags: ["rounds"] }
  )();
}

/** @deprecated Use getSubRounds */
export const getGameweekRounds = getSubRounds;

export async function createRound(data: {
  name: string;
  startsAt: Date;
  endsAt: Date;
}) {
  const round = await prisma.round.create({ data });
  revalidateTag("rounds");
  return round;
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
