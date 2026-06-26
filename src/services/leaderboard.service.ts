import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getTournamentRoundName } from "@/lib/rounds";
import { getTournamentRound } from "@/services/match.service";
import type { LeaderboardEntry } from "@/types";

export { getUserTotalPoints } from "@/services/user-points.service";

type PointsRow = { username: string; points: number };

const LB_CACHE_SECONDS = 300;

// Riyadh timezone offset (UTC+3) used for day boundaries and night window logic
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

type PointsFilter = {
  roundId?: string;
  roundIds?: string[];
  before?: Date;
  from?: Date;
  to?: Date;
};

function matchWhere(filter: PointsFilter) {
  const roundClause = filter.roundIds?.length
    ? { roundId: { in: filter.roundIds } }
    : filter.roundId
      ? { roundId: filter.roundId }
      : {};

  const matchTime =
    filter.from || filter.to || filter.before
      ? {
          ...(filter.before ? { lt: filter.before } : {}),
          ...(filter.from ? { gte: filter.from } : {}),
          ...(filter.to ? { lt: filter.to } : {}),
        }
      : undefined;

  return {
    ...roundClause,
    ...(filter.before
      ? {
          status: "FINISHED" as const,
        }
      : {}),
    ...(matchTime ? { matchTime } : {}),
  };
}

async function getUserPointsMap(filter: PointsFilter = {}): Promise<Map<string, PointsRow>> {
  const hasMatchFilter = Boolean(
    filter.roundId || filter.roundIds?.length || filter.before || filter.from || filter.to
  );
  const where = hasMatchFilter ? { match: matchWhere(filter) } : undefined;

  const boldWhere = {
    ...(hasMatchFilter ? { match: matchWhere(filter) } : {}),
    cancelledAt: null,
  };
  const octopusWhere = {
    ...(hasMatchFilter ? { match: matchWhere(filter) } : {}),
    cancelledAt: null,
  };

  const [allUsers, predictionGroups, scorerGroups, boldGroups, octopusGroups] =
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
      prisma.octopusGoalkeeperBet.groupBy({
        by: ["userId"],
        where: octopusWhere,
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

  for (const g of octopusGroups) {
    const pts = g._sum.points ?? 0;
    const existing = pointsMap.get(g.userId);
    if (existing) {
      existing.points += pts;
    }
  }

  return pointsMap;
}

function buildLeaderboard(pointsMap: Map<string, PointsRow>): LeaderboardEntry[] {
  // استبعد حسابات الاختبار وبعض المستخدمين بحسب القواعد
  const EXCLUDED_USERNAMES = new Set(["mmg"]);
  const EXCLUDE_PATTERNS: RegExp[] = [
    /^qa_/i,
    /^ui_qa_/i,
    /^test/i,
    /tester/i,
    /^demo/i,
    /^sample/i,
    /^tmp/i,
    /_test/i,
  ];

  function shouldExcludeFromLeaderboard(username: string | undefined, points: number) {
    if (!username) return false;
    const raw = username.trim();
    if (!raw) return false;
    const lower = raw.toLowerCase();
    if (EXCLUDED_USERNAMES.has(lower)) return true;
    // اخفي ali حتى يجيب نقطته الأولى
    if (lower === "ali" && points <= 0) return true;
    for (const p of EXCLUDE_PATTERNS) {
      if (p.test(raw)) return true;
    }
    return false;
  }

  const entries = Array.from(pointsMap.entries())
    .filter(([, data]) => !shouldExcludeFromLeaderboard(data.username, data.points))
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

function currentNightWindow(now = new Date()) {
  const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
  const local = new Date(now.getTime() + RIYADH_OFFSET_MS);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  const day = local.getUTCDate();
  const hour = local.getUTCHours();

  const localUtc = (d: number, h: number) =>
    new Date(Date.UTC(year, month, d, h, 0, 0, 0) - RIYADH_OFFSET_MS);

  if (hour >= 19) {
    return {
      start: localUtc(day, 19),
      end: localUtc(day + 1, 10),
    };
  }

  return {
    start: localUtc(day - 1, 19),
    end: localUtc(day, 10),
  };
}

function isNowInNightWindow(now = new Date()) {
  const { start, end } = currentNightWindow(now);
  return now >= start && now < end;
}

async function attachNightChampion(
  entries: LeaderboardEntry[]
): Promise<LeaderboardEntry[]> {
  if (entries.length === 0) return entries;

  const { start, end } = currentNightWindow();
  const windowPoints = await getUserPointsMap({ from: start, to: end });
  let championUserId: string | null = null;
  let championPoints = 0;

  for (const [userId, row] of windowPoints.entries()) {
    if (row.points > championPoints) {
      championUserId = userId;
      championPoints = row.points;
    }
  }

  return entries.map((entry) => {
    const nightWindowPoints = windowPoints.get(entry.userId)?.points ?? 0;
    return {
      ...entry,
      nightWindowPoints,
      isNightChampion:
        championPoints > 0 && entry.userId === championUserId,
    };
  });
}

function startOfDayUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0));
}

function startOfNextDayUTC(d: Date) {
  return new Date(startOfDayUTC(d).getTime() + 24 * 60 * 60 * 1000);
}

async function computeLeaderStreakDays(
  leaderUserId: string,
  maxDays = 365,
  currentMap?: Map<string, PointsRow>
) {
  if (!leaderUserId) return 0;
  // Bound maxDays for safety/performace
  const cappedMax = Math.min(maxDays, 365);
  // Use Riyadh-local day boundaries so streaks align with the app's night-window
  const local = new Date(Date.now() + RIYADH_OFFSET_MS);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  const day = local.getUTCDate();

  // helper to get top user before a cutoff date using a single aggregated SQL query
  async function getTopUserBefore(cutoff: Date): Promise<string | null> {
    const res: Array<{ user_id: string } & Record<string, unknown>> = await prisma.$queryRawUnsafe(
      `
      SELECT t.user_id
      FROM (
        SELECT p.user_id, SUM(p.points + COALESCE(p.double_bonus,0) + COALESCE(p.finish_type_points,0) + COALESCE(p.penalty_winner_points,0)) AS total
        FROM predictions p
        JOIN matches m ON p.match_id = m.id
        WHERE m.match_time < $1
        GROUP BY p.user_id
        UNION ALL
        SELECT sp.user_id, SUM(sp.points) AS total
        FROM scorer_predictions sp
        JOIN matches m ON sp.match_id = m.id
        WHERE m.match_time < $1
        GROUP BY sp.user_id
        UNION ALL
        SELECT b.user_id, SUM(b.points) AS total
        FROM bold_scorer_bets b
        JOIN matches m ON b.match_id = m.id
        WHERE m.match_time < $1
          AND b.cancelled_at IS NULL
        GROUP BY b.user_id
        UNION ALL
        SELECT o.user_id, SUM(o.points) AS total
        FROM octopus_goalkeeper_bets o
        JOIN matches m ON o.match_id = m.id
        WHERE m.match_time < $1
          AND o.cancelled_at IS NULL
        GROUP BY o.user_id
      ) t
      GROUP BY t.user_id
      ORDER BY SUM(t.total) DESC, t.user_id ASC
      LIMIT 1
      `,
      cutoff
    );

    if (!res || res.length === 0) return null;
    return res[0].user_id;
  }

  let streak = 0;

  for (let i = 0; i < cappedMax; i++) {
    // compute Riyadh-local day d = (today - i)
    const d = day - i;
    // cutoff = start of next day in Riyadh expressed as UTC time
    const cutoff = new Date(Date.UTC(year, month, d + 1, 0, 0, 0, 0) - RIYADH_OFFSET_MS);

    // for today's snapshot reuse currentMap if provided
    if (i === 0 && currentMap) {
      const entries = buildLeaderboard(currentMap);
      const top = entries[0];
      if (!top) break;
      if (top.userId === leaderUserId) {
        streak++;
        continue;
      }
      break;
    }

    const topUser = await getTopUserBefore(cutoff);
    if (!topUser) break;
    if (topUser === leaderUserId) streak++;
    else break;
  }

  return streak;
}

async function buildOverallLeaderboard(withTrend: boolean): Promise<LeaderboardEntry[]> {
  if (!withTrend) {
    return attachNightChampion(buildLeaderboard(await getUserPointsMap()));
  }

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [currentMap, previousMap] = await Promise.all([
    getUserPointsMap(),
    getUserPointsMap({ before: weekAgo }),
  ]);

  const current = buildLeaderboard(currentMap);
  const previous = buildLeaderboard(previousMap);
  const withRank = attachRankChange(current, previous);
  const withNight = await attachNightChampion(withRank);

  // حساب الستريك لمستخدم الصدارة (إن وُجد) — يظهر فقط إذا تساوى أو تجاوز 3 أيام
  if (withNight.length > 0) {
    try {
      const leader = withNight[0];
      // Cache the (expensive) streak calculation per-leader for a short time
      const streak = await unstable_cache(
        () => computeLeaderStreakDays(leader.userId, 365, currentMap),
        ["leader-streak", leader.userId],
        { revalidate: 60 }
      )();
      if (streak >= 3) {
        leader.streakDays = streak;
      }
    } catch (err) {
      // لا نفشل بناء الليدربورد بسبب فشل حساب الستريك
      // eslint-disable-next-line no-console
      console.warn("[leader-streak] compute failed:", err instanceof Error ? err.message : err);
    }
  }

  return withNight;
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

  // If we're inside the night window, return fresh data so `isNightChampion` updates live.
  if (isNowInNightWindow()) {
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
  const [tournamentRound, overall] = await Promise.all([
    getTournamentRound(),
    getOverallLeaderboard({ withTrend: true }),
  ]);
  const totalPoints =
    overall.find((entry) => entry.userId === userId)?.points ?? 0;

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
