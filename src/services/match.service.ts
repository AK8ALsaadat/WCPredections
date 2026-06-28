/* eslint-disable @typescript-eslint/no-explicit-any */
import { revalidateTag, unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isPredictionAllowed } from "@/lib/utils";
import { shouldShowMatchInUpcomingList } from "@/lib/tournament-gates";
import { getTournamentRoundName } from "@/lib/rounds";
import { filterVisibleMatches } from "@/lib/tournament-gates";
import { matchIdentityKey } from "@/lib/team-identity";
import type { MatchStatus } from "@prisma/client";
import { recalculateMatchScoring } from "@/services/prediction.service";
import { getRoundUsageLimits } from "@/services/round-usage.service";

const teamSelect = {
  id: true,
  name: true,
  shortName: true,
  logoUrl: true,
} as const;

function dedupeMatches<T extends { matchTime?: unknown; homeTeam?: unknown; awayTeam?: unknown; apiMatchId?: unknown }>(rows: T[]): T[] {
  if (!rows || rows.length <= 1) return rows;
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const homeName = String((r.homeTeam as any)?.name ?? "");
    const awayName = String((r.awayTeam as any)?.name ?? "");
    const key = `${matchIdentityKey(homeName, awayName)}|${new Date(
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
        where: { userId, matchId: { in: matchIds }, cancelledAt: null },
        select: {
          matchId: true,
          points: true,
          playerId: true,
          player: { select: { id: true, name: true } },
        },
      }),
      prisma.octopusGoalkeeperBet.findMany({
        where: { userId, matchId: { in: matchIds }, cancelledAt: null },
        select: {
          matchId: true,
          points: true,
          playerId: true,
          player: { select: { id: true, name: true, teamId: true } },
        },
      }),
    ]);

  const octopusStats =
    octopusBets.length > 0
      ? await prisma.matchGoalkeeperStat.findMany({
          where: {
            matchId: { in: matchIds },
            playerId: { in: octopusBets.map((bet) => bet.playerId) },
          },
          select: { matchId: true, playerId: true, saves: true },
        })
      : [];
  const octopusStatsByMatchPlayer = new Map(
    octopusStats.map((stat) => [
      statKey(stat.matchId, stat.playerId),
      stat.saves,
    ])
  );
  const matchContextById = new Map(
    matches.map((match) => [
      match.id,
      {
        homeTeamId: (match as any).homeTeamId,
        awayTeamId: (match as any).awayTeamId,
        homeScore: (match as any).homeScore ?? null,
        awayScore: (match as any).awayScore ?? null,
      } as OctopusMatchContext,
    ])
  );

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
      buildOctopusBetView(
        b,
        matchContextById.get(b.matchId),
        octopusStatsByMatchPlayer.get(statKey(b.matchId, b.playerId))
      ),
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

type OctopusMatchContext = {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
};

type OctopusBetSource = {
  matchId?: string;
  points: number;
  playerId: string;
  player: { id?: string; name: string; teamId?: string | null };
};

function getGoalsConcededForTeam(
  match: OctopusMatchContext | null | undefined,
  teamId: string | null | undefined
) {
  if (!match || !teamId) return null;
  if (teamId === match.homeTeamId) return match.awayScore;
  if (teamId === match.awayTeamId) return match.homeScore;
  return null;
}

function statKey(matchId: string, playerId: string) {
  return `${matchId}:${playerId}`;
}

function buildOctopusBetView(
  bet: OctopusBetSource,
  match: OctopusMatchContext | null | undefined,
  saves?: number | null
) {
  return {
    points: bet.points,
    saves: saves ?? null,
    goalsConceded: getGoalsConcededForTeam(match, bet.player.teamId),
    player: {
      id: bet.player.id,
      name: bet.player.name,
    },
  };
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
      where: { userId, cancelledAt: null },
      select: {
        points: true,
        player: { select: { name: true } },
      },
    },
    octopusBets: {
      where: { userId, cancelledAt: null },
      select: {
        matchId: true,
        playerId: true,
        points: true,
        player: { select: { id: true, name: true, teamId: true } },
      },
    },
    goalkeeperStats: {
      select: { playerId: true, saves: true },
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
    .map(({ predictions, scorerPredictions, boldScorerBets, octopusBets, goalkeeperStats, ...match }) => {
      const octopusBet = octopusBets[0] ?? null;
      return {
        ...match,
        userPrediction: predictions[0] ?? null,
        userScorerPredictions: scorerPredictions,
        userBoldScorerBet: boldScorerBets[0] ?? null,
        userOctopusBet: octopusBet
          ? buildOctopusBetView(
              octopusBet,
              match,
              goalkeeperStats.find((stat) => stat.playerId === octopusBet.playerId)
                ?.saves
            )
          : null,
      };
    })
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
  return filterVisibleMatches(dedupeMatches(rows));
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
  const deduped = filterVisibleMatches(dedupeMatches(rows));

  return deduped.filter((match) => {
    if (match.status !== "SCHEDULED" && match.status !== "LIVE") return false;

    const matchTime = new Date(match.matchTime).getTime();
    if (matchTime < now) return false;

    return shouldShowMatchInUpcomingList(match);
  });
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
  const rows = await unstable_cache(
    () =>
      prisma.match.findMany({
        where: { roundId: roundId ?? undefined },
        include: {
          homeTeam: { select: teamSelect },
          awayTeam: { select: teamSelect },
          round: { select: { id: true, name: true } },
        },
        orderBy: { matchTime: "asc" },
      }),
    ["all-matches", roundId ?? "all"],
    { revalidate: 60, tags: ["matches-schedule"] }
  )();
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

async function fetchMatchDetailBase(matchId: string) {
  return prisma.match.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      matchTime: true,
      status: true,
      isKnockout: true,
      actualFinishType: true,
      penaltyWinnerTeamId: true,
      homeScore: true,
      awayScore: true,
      roundId: true,
      homeTeamId: true,
      awayTeamId: true,
      homeTeam: { select: teamSelect },
      awayTeam: { select: teamSelect },
      round: { select: { id: true, name: true } },
      matchScorers: {
        select: {
          goals: true,
          player: { select: { id: true, name: true } },
        },
      },
      goalkeeperStats: {
        select: { playerId: true, saves: true },
      },
    },
  });
}

function getCachedMatchDetailBase(matchId: string) {
  return unstable_cache(
    () => fetchMatchDetailBase(matchId),
    ["match-detail-base-v1", matchId],
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

function positionRank(position?: string | null) {
  const text = (position ?? "").toLowerCase();
  if (/goal|keeper|\bgk\b|حارس/.test(text)) return 0;
  if (/def|back|مدافع/.test(text)) return 1;
  if (/mid|وسط/.test(text)) return 2;
  if (/for|att|wing|striker|مهاجم/.test(text)) return 3;
  return 4;
}

function toFastPlayers(
  players: {
    id: string;
    name: string;
    position: string | null;
    shirtNumber: number | null;
    photoUrl: string | null;
  }[]
) {
  return players
    .slice()
    .sort((a, b) => {
      const rankDiff = positionRank(a.position) - positionRank(b.position);
      if (rankDiff !== 0) return rankDiff;
      return a.name.localeCompare(b.name);
    })
    .slice(0, 26)
    .map((player, index) => ({
      id: player.id,
      name: player.name,
      position: player.position,
      shirtNumber: player.shirtNumber,
      photoUrl: player.photoUrl,
      section: index < 11 ? ("lineup" as const) : ("bench" as const),
      grid: null,
    }));
}

async function buildFastMatchLineup(matchId: string) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      homeTeam: {
        select: {
          name: true,
          shortName: true,
          players: {
            select: {
              id: true,
              name: true,
              position: true,
              shirtNumber: true,
              photoUrl: true,
            },
            orderBy: { name: "asc" },
          },
        },
      },
      awayTeam: {
        select: {
          name: true,
          shortName: true,
          players: {
            select: {
              id: true,
              name: true,
              position: true,
              shirtNumber: true,
              photoUrl: true,
            },
            orderBy: { name: "asc" },
          },
        },
      },
    },
  });

  if (!match) return null;

  return {
    homePlayers: toFastPlayers(match.homeTeam.players),
    awayPlayers: toFastPlayers(match.awayTeam.players),
    homeFormation: "4-3-3",
    awayFormation: "4-3-3",
    homeLineupSource: "estimated" as const,
    awayLineupSource: "estimated" as const,
    lineupStatus: "estimated" as const,
    homeTeamName: match.homeTeam.name,
    awayTeamName: match.awayTeam.name,
    homeShortName: match.homeTeam.shortName,
    awayShortName: match.awayTeam.shortName,
  };
}

function getCachedFastMatchLineup(matchId: string) {
  return unstable_cache(
    () => buildFastMatchLineup(matchId),
    ["match-lineup-fast-v1", matchId],
    {
      revalidate: MATCH_LINEUP_SHARED_CACHE_SECONDS,
      tags: [`lineup-${matchId}`],
    }
  )();
}

function getCachedFullMatchLineup(matchId: string) {
  return unstable_cache(
    () => buildMatchLineup(matchId),
    ["match-lineup-full-v2", matchId],
    {
      revalidate: MATCH_LINEUP_SHARED_CACHE_SECONDS,
      tags: [`lineup-${matchId}`],
    }
  )();
}

export function prewarmFastMatchLineups(matchIds: string[]) {
  const uniqueIds = Array.from(new Set(matchIds)).slice(0, 8);
  if (uniqueIds.length === 0) return;

  setTimeout(() => {
    void (async () => {
      for (const matchId of uniqueIds) {
        try {
          await getCachedFastMatchLineup(matchId);
        } catch {
          // Background warming is best-effort only.
        }
      }
    })();
  }, 0);
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
    const [{ invalidateCacheKey }, { clearExpectedLineupCaches }] =
      await Promise.all([
        import("@/lib/api-cache"),
        import("@/services/match-players.service"),
      ]);
    clearExpectedLineupCaches();
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

  const data = await getCachedFullMatchLineup(matchId);

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

  const [octopusCount, predictionsCount, doublesCount, boldCount] = await Promise.all([
    prisma.octopusGoalkeeperBet.count({ where: { matchId, cancelledAt: null } }),
    prisma.prediction.count({ where: { matchId } }),
    prisma.prediction.count({ where: { matchId, isDouble: true } }),
    prisma.boldScorerBet.count({ where: { matchId, cancelledAt: null } }),
  ]);

  const baseResult = {
    ...match,
    userPrediction,
    userScorerPredictions,
    userBoldScorerBet,
    userOctopusBet,
    boldScorerRoundStatus,
    octopusRoundStatus,
    roundUsageLimits,
    octopusCount,
    predictionsCount,
    doublesCount,
    boldCount,
  };

  // If a user is present, include a lightweight fast lineup so the client
  // can show predicted player names and enable interaction immediately
  // while the full lineup is fetched in the background.
  if (userId) {
    try {
      const fastLineup = await getCachedFastMatchLineup(matchId);
      if (fastLineup) {
        return { ...baseResult, ...fastLineup };
      }
    } catch {
      // best-effort only; fallthrough to baseResult
    }
  }

  return baseResult;
}

export async function getMatchById(
  matchId: string,
  userId?: string,
  options?: { includeLineup?: boolean }
) {
  const match = await getCachedMatchDetailBase(matchId);

  if (!match) return null;

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
      }),
      prisma.scorerPrediction.findMany({
        where: { userId, matchId },
        select: {
          predictedGoals: true,
          points: true,
          player: { select: { id: true, name: true, teamId: true } },
        },
      }),
      predictionOpen
        ? getRoundUsageLimits(userId, matchId, match.roundId)
        : Promise.resolve(null),
      predictionOpen
        ? Promise.resolve(null)
        : prisma.boldScorerBet.findFirst({
            where: { userId, matchId, cancelledAt: null },
          select: {
            playerId: true,
            points: true,
            player: { select: { id: true, name: true, teamId: true } },
          },
        }),
      predictionOpen
        ? Promise.resolve(null)
        : prisma.octopusGoalkeeperBet.findFirst({
            where: { userId, matchId, cancelledAt: null },
            select: {
              playerId: true,
              points: true,
              player: { select: { id: true, name: true, teamId: true } },
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
          saves:
            match.goalkeeperStats.find(
              (stat) => stat.playerId === octopusStatus.playerId
            )?.saves ?? null,
          goalsConceded: null,
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
      userOctopusBet = buildOctopusBetView(
        closedOctopusBet,
        match,
        match.goalkeeperStats.find(
          (stat) => stat.playerId === closedOctopusBet.playerId
        )?.saves
      );
    }
  }

  const { goalkeeperStats: _goalkeeperStats, ...matchWithoutGoalkeeperStats } =
    match;
  void _goalkeeperStats;
  const base = {
    ...matchWithoutGoalkeeperStats,
    userPrediction,
    userScorerPredictions,
    userBoldScorerBet,
    userOctopusBet,
    boldScorerRoundStatus,
    octopusRoundStatus,
    roundUsageLimits,
    octopusCount: 0,
    predictionsCount: 0,
    doublesCount: 0,
    boldCount: 0,
  };

  if (!options?.includeLineup) {
    const [octopusCount, predictionsCount, doublesCount, boldCount] = await Promise.all([
      prisma.octopusGoalkeeperBet.count({ where: { matchId, cancelledAt: null } }),
      prisma.prediction.count({ where: { matchId } }),
      prisma.prediction.count({ where: { matchId, isDouble: true } }),
      prisma.boldScorerBet.count({ where: { matchId, cancelledAt: null } }),
    ]);
    return { ...base, octopusCount, predictionsCount, doublesCount, boldCount };
  }

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
      const uniquePlayerIds = Array.from(new Set(data.scorerPlayerIds));
      await prisma.matchScorer.createMany({
        data: uniquePlayerIds.map((playerId) => ({
          matchId,
          playerId,
          goals: 1,
        })),
        skipDuplicates: true,
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
