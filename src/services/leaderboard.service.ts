import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getTournamentRoundName } from "@/lib/rounds";
import { getTournamentRound } from "@/services/match.service";
import type { LeaderboardEntry } from "@/types";
import { getUserTotalPoints } from "@/services/user-points.service";

export { getUserTotalPoints } from "@/services/user-points.service";

type PointsRow = { username: string; points: number };

const LB_CACHE_SECONDS = 120;

type PointsFilter = {
  roundId?: string;
  roundIds?: string[];
  before?: Date;
};

function matchWhere(filter: PointsFilter) {
  const roundClause = filter.roundIds?.length
    ? { roundId: { in: filter.roundIds } }
    : filter.roundId
      ? { roundId: filter.roundId }
      : {};

  return {
    ...roundClause,
    ...(filter.before
      ? {
          status: "FINISHED" as const,
          matchTime: { lt: filter.before },
        }
      : {}),
  };
}

async function getUserPointsMap(filter: PointsFilter = {}): Promise<Map<string, PointsRow>> {
  const hasMatchFilter = Boolean(
    filter.roundId || filter.roundIds?.length || filter.before
  );
  const where = hasMatchFilter ? { match: matchWhere(filter) } : undefined;

  const boldWhere = hasMatchFilter ? { match: matchWhere(filter) } : undefined;

  const [allUsers, predictionGroups, scorerGroups, boldGroups] =
    await Promise.all([
      prisma.user.findMany({
        select: { id: true, username: true },
        orderBy: { username: "asc" },
      }),
      prisma.prediction.groupBy({
        by: ["userId"],
        where,
        _sum: {
          points: true,
          doubleBonus: true,
          finishTypePoints: true,
          penaltyWinnerPoints: true,
        },
      }),
      prisma.scorerPrediction.groupBy({
        by: ["userId"],
        where,
        _sum: { points: true },
      }),
      prisma.boldScorerBet.groupBy({
        by: ["userId"],
        where: boldWhere,
        _sum: { points: true },
      }),
    ]);

  const pointsMap = new Map<string, PointsRow>();
  for (const user of allUsers) {
    pointsMap.set(user.id, { username: user.username, points: 0 });
  }

  for (const g of predictionGroups) {
    const total =
      (g._sum.points ?? 0) +
      (g._sum.doubleBonus ?? 0) +
      (g._sum.finishTypePoints ?? 0) +
      (g._sum.penaltyWinnerPoints ?? 0);
    const existing = pointsMap.get(g.userId);
    if (existing) {
      existing.points += total;
    }
  }

  for (const g of scorerGroups) {
    const pts = g._sum.points ?? 0;
    const existing = pointsMap.get(g.userId);
    if (existing) {
      existing.points += pts;
    }
  }

  for (const g of boldGroups) {
    const pts = g._sum.points ?? 0;
    const existing = pointsMap.get(g.userId);
    if (existing) {
      existing.points += pts;
    }
  }

  return pointsMap;
}

function buildLeaderboard(pointsMap: Map<string, PointsRow>): LeaderboardEntry[] {
  const entries = Array.from(pointsMap.entries())
    .map(([userId, data]) => ({
      userId,
      username: data.username,
      points: data.points,
      rank: 0,
    }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return a.username.localeCompare(b.username);
    });

  for (let i = 0; i < entries.length; i++) {
    entries[i].rank = i + 1;
  }

  return entries;
}

async function getTournamentRoundIds(): Promise<string[]> {
  const tournamentRound = await getTournamentRound();
  if (!tournamentRound) return [];

  const tournamentName = getTournamentRoundName();
  const subRounds = await prisma.round.findMany({
    where: { name: { not: tournamentName } },
    select: { id: true },
  });

  return [tournamentRound.id, ...subRounds.map((r) => r.id)];
}

function attachRankChange(
  current: LeaderboardEntry[],
  previous: LeaderboardEntry[]
): LeaderboardEntry[] {
  const prevRank = new Map(previous.map((e) => [e.userId, e.rank]));

  return current.map((entry) => {
    const lastRank = prevRank.get(entry.userId);
    if (lastRank == null) {
      return { ...entry, rankChange: undefined };
    }
    return { ...entry, rankChange: lastRank - entry.rank };
  });
}

async function buildOverallLeaderboard(withTrend: boolean): Promise<LeaderboardEntry[]> {
  if (!withTrend) {
    return buildLeaderboard(await getUserPointsMap());
  }

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [currentMap, previousMap] = await Promise.all([
    getUserPointsMap(),
    getUserPointsMap({ before: weekAgo }),
  ]);

  return attachRankChange(
    buildLeaderboard(currentMap),
    buildLeaderboard(previousMap)
  );
}

async function buildRoundLeaderboard(roundId: string): Promise<LeaderboardEntry[]> {
  const tournamentRound = await getTournamentRound();
  const isMainTournament = tournamentRound?.id === roundId;

  const pointsMap = isMainTournament
    ? await getUserPointsMap({ roundIds: await getTournamentRoundIds() })
    : await getUserPointsMap({ roundId });

  return buildLeaderboard(pointsMap);
}

export async function getOverallLeaderboard(options?: {
  withTrend?: boolean;
  fresh?: boolean;
}): Promise<LeaderboardEntry[]> {
  const withTrend = options?.withTrend ?? true;
  if (options?.fresh) {
    return buildOverallLeaderboard(withTrend);
  }

  return unstable_cache(
    () => buildOverallLeaderboard(withTrend),
    ["overall-leaderboard", withTrend ? "trend" : "plain"],
    { revalidate: LB_CACHE_SECONDS, tags: ["leaderboard-overall"] }
  )();
}

export async function getRoundLeaderboard(
  roundId: string,
  options?: { fresh?: boolean }
): Promise<LeaderboardEntry[]> {
  if (options?.fresh) {
    return buildRoundLeaderboard(roundId);
  }

  return unstable_cache(
    () => buildRoundLeaderboard(roundId),
    ["round-leaderboard", roundId],
    { revalidate: LB_CACHE_SECONDS, tags: [`leaderboard-round-${roundId}`] }
  )();
}

export function computeRoundAveragePoints(
  entries: Pick<LeaderboardEntry, "points">[]
): number {
  if (entries.length === 0) return 0;
  const sum = entries.reduce((total, entry) => total + entry.points, 0);
  return Math.round((sum / entries.length) * 10) / 10;
}

export function statsFromLeaderboard(
  entries: LeaderboardEntry[],
  userId?: string
) {
  let myPoints = 0;
  let myRank: number | null = null;

  if (userId) {
    const me = entries.find((e) => e.userId === userId);
    myPoints = me?.points ?? 0;
    myRank = me?.rank ?? null;
  }

  return {
    participantCount: entries.length,
    averagePoints: computeRoundAveragePoints(entries),
    myPoints,
    myRank,
  };
}

/** إحصائيات الجولة: نقاط المستخدم والمتوسط بين المشاركين */
export async function getRoundLeaderboardStats(
  roundId: string,
  userId?: string
) {
  const entries = await getRoundLeaderboard(roundId);
  return statsFromLeaderboard(entries, userId);
}

/** بيانات الرئيسية — استعلامات مجمّعة ومخزّنة مؤقتاً */
export async function getDashboardData(userId: string) {
  const [tournamentRound, totalPoints, overall] = await Promise.all([
    getTournamentRound(),
    getUserTotalPoints(userId),
    getOverallLeaderboard({ withTrend: true }),
  ]);

  return {
    tournamentRound,
    totalPoints,
    overall,
  };
}

/** الجولة الرئيسية لبطولة الاستراحة */
export async function getCurrentRound() {
  return getTournamentRound();
}

/** جولة فرعية نشطة داخل البطولة (ترتيب جولة محددة) */
async function fetchCurrentSubRound() {
  const tournamentName = getTournamentRoundName();
  const now = new Date();

  const active = await prisma.round.findFirst({
    where: {
      name: { not: tournamentName },
      startsAt: { lte: now },
      endsAt: { gte: now },
    },
    orderBy: { startsAt: "desc" },
    include: { _count: { select: { matches: true } } },
  });

  if (active) return active;

  return prisma.round.findFirst({
    where: { name: { not: tournamentName } },
    orderBy: { startsAt: "desc" },
    include: { _count: { select: { matches: true } } },
  });
}

const getCachedCurrentSubRound = unstable_cache(
  fetchCurrentSubRound,
  ["current-sub-round"],
  { revalidate: 120 }
);

export async function getCurrentSubRound() {
  return getCachedCurrentSubRound();
}

/** @deprecated Use getCurrentSubRound */
export const getCurrentGameweek = getCurrentSubRound;
