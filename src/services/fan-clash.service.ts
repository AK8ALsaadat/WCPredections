import { prisma } from "@/lib/prisma";
import { getMatchLineup } from "@/services/match.service";
import { matchIdentityKey } from "@/lib/team-identity";

const MAX_PICKS = 4;
const POWERUP_MINUTES = 10;
const LIVE_CACHE_MS = 120_000;
const FINISHED_CACHE_MS = 12 * 60 * 60 * 1000;
const QUOTA_COOLDOWN_MS = 12 * 60 * 60 * 1000;
let fanClashKeyIndex = 0;

type ApiFootballResponse<T> = {
  response?: T;
  errors?: Record<string, string> | unknown[];
};

type ApiEventRow = {
  time: { elapsed?: number | null; extra?: number | null };
  team: { id: number; name: string };
  player: { id: number | null; name: string } | null;
  assist: { id: number | null; name: string } | null;
  type: string;
  detail: string;
};

type ApiPlayerStatsRow = {
  team: { id: number; name: string };
  players: {
    player: { id: number | null; name: string; photo?: string | null };
    statistics?: {
      games?: { minutes?: number | null; position?: string | null; rating?: string | null };
      shots?: { on?: number | null; total?: number | null };
      goals?: { total?: number | null; assists?: number | null; saves?: number | null };
      passes?: { total?: number | null; key?: number | null; accuracy?: string | number | null };
      tackles?: { total?: number | null; interceptions?: number | null };
      duels?: { won?: number | null };
      fouls?: { committed?: number | null; drawn?: number | null };
      cards?: { yellow?: number | null; red?: number | null };
      penalty?: { missed?: number | null; saved?: number | null };
    }[];
  }[];
};

type LiveCacheEntry = {
  expiresAt: number;
  data: {
    events: ApiEventRow[];
    stats: ApiPlayerStatsRow[];
  };
};

type PlayerPointLine = {
  playerId: string;
  playerName: string;
  label: string;
  points: number;
  minute?: number | null;
  doubled?: boolean;
};

function dedupeFanClashMatches<
  T extends {
    matchTime: Date;
    homeTeam: { name: string };
    awayTeam: { name: string };
    apiMatchId?: string | null;
    updatedAt?: Date;
  },
>(matches: T[]) {
  const groups = new Map<string, T[]>();
  for (const match of matches) {
    const key = `${matchIdentityKey(
      match.homeTeam.name,
      match.awayTeam.name
    )}|${match.matchTime.getTime()}`;
    const group = groups.get(key) ?? [];
    group.push(match);
    groups.set(key, group);
  }

  const result: T[] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => {
      const score = (match: T) =>
        (match.apiMatchId && /^\d+$/.test(match.apiMatchId) ? 50 : 0) +
        (match.apiMatchId ? 10 : 0) +
        (match.updatedAt?.getTime() ?? 0) / 1_000_000_000_000;
      return score(b) - score(a);
    });
    result.push(group[0]);
  }

  return result.sort((a, b) => a.matchTime.getTime() - b.matchTime.getTime());
}

const liveCache = new Map<string, LiveCacheEntry>();
const exhaustedKeys = new Map<string, number>();

function apiFootballConfigured() {
  return getFanClashApiKeys().length > 0;
}

function getFanClashApiKeys() {
  const dedicated = process.env.FAN_CLASH_API_FOOTBALL_KEYS
    ?.split(",")
    .map((key) => key.trim())
    .filter(Boolean);
  if (dedicated && dedicated.length > 0) return dedicated;

  return process.env.API_FOOTBALL_KEY ? [process.env.API_FOOTBALL_KEY] : [];
}

function getAvailableFanClashApiKeys() {
  const now = Date.now();
  return getFanClashApiKeys().filter((key) => {
    const blockedUntil = exhaustedKeys.get(key) ?? 0;
    if (blockedUntil <= now) {
      exhaustedKeys.delete(key);
      return true;
    }
    return false;
  });
}

function isQuotaError(status: number, body: unknown) {
  const text =
    typeof body === "string" ? body : JSON.stringify(body ?? "").toLowerCase();
  return (
    status === 429 ||
    text.includes("rate limit") ||
    text.includes("request limit") ||
    text.includes("requests limit") ||
    text.includes("quota") ||
    text.includes("too many requests")
  );
}

function markKeyExhausted(key: string) {
  exhaustedKeys.set(key, Date.now() + QUOTA_COOLDOWN_MS);
}

async function apiFootballFetch<T>(
  endpoint: string,
  params: Record<string, string>
): Promise<T> {
  const apiKeys = getAvailableFanClashApiKeys();
  if (apiKeys.length === 0) {
    const configuredKeys = getFanClashApiKeys().length;
    throw new Error(
      configuredKeys > 0
        ? "Fan Clash API quota is exhausted for today"
        : "FAN_CLASH_API_FOOTBALL_KEYS is not configured"
    );
  }

  const baseUrl =
    process.env.API_FOOTBALL_BASE_URL ?? "https://v3.football.api-sports.io";
  const url = new URL(`${baseUrl}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  let lastError: unknown = null;
  for (let attempt = 0; attempt < apiKeys.length; attempt++) {
    const apiKey = apiKeys[fanClashKeyIndex % apiKeys.length];
    fanClashKeyIndex = (fanClashKeyIndex + 1) % apiKeys.length;

    try {
      const response = await fetch(url, {
        headers: { "x-apisports-key": apiKey },
        cache: "no-store",
        signal: AbortSignal.timeout(7_000),
      });

      const data = (await response.json().catch(() => ({}))) as ApiFootballResponse<T>;

      if (!response.ok) {
        if (isQuotaError(response.status, data)) {
          markKeyExhausted(apiKey);
          lastError = new Error("Fan Clash API quota is exhausted for one key");
          continue;
        }
        throw new Error(`API-Football request failed: ${response.statusText}`);
      }

      const hasErrors =
        data.errors &&
        !Array.isArray(data.errors) &&
        Object.keys(data.errors).length > 0;
      if (hasErrors) {
        if (isQuotaError(response.status, data.errors)) {
          markKeyExhausted(apiKey);
          lastError = new Error("Fan Clash API quota is exhausted for one key");
          continue;
        }
        throw new Error(`API-Football error: ${JSON.stringify(data.errors)}`);
      }

      return (data.response ?? ([] as T)) as T;
    } catch (error) {
      lastError = error;
      if (attempt === apiKeys.length - 1) break;
    }
  }

  if (getAvailableFanClashApiKeys().length === 0) {
    throw new Error("Fan Clash API quota is exhausted for today");
  }
  throw lastError instanceof Error ? lastError : new Error("API-Football request failed");
}

async function fetchLiveData(
  apiMatchId: string,
  status: "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED" | "CANCELLED"
) {
  if (status === "SCHEDULED" || status === "POSTPONED" || status === "CANCELLED") {
    return { events: [], stats: [] };
  }

  const cached = liveCache.get(apiMatchId);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const [eventsResult, statsResult] = await Promise.allSettled([
    apiFootballFetch<ApiEventRow[]>("/fixtures/events", { fixture: apiMatchId }),
    apiFootballFetch<ApiPlayerStatsRow[]>("/fixtures/players", { fixture: apiMatchId }),
  ]);

  const quotaFailure = [eventsResult, statsResult].find(
    (result) =>
      result.status === "rejected" &&
      result.reason instanceof Error &&
      result.reason.message.includes("quota is exhausted")
  );
  if (quotaFailure?.status === "rejected") {
    throw quotaFailure.reason;
  }

  const events = eventsResult.status === "fulfilled" ? eventsResult.value : [];
  const stats = statsResult.status === "fulfilled" ? statsResult.value : [];

  const data = {
    events,
    stats,
  };
  liveCache.set(apiMatchId, {
    data,
    expiresAt:
      Date.now() + (status === "FINISHED" ? FINISHED_CACHE_MS : LIVE_CACHE_MS),
  });
  return data;
}

function eventMinute(event: ApiEventRow) {
  return (event.time.elapsed ?? 0) + (event.time.extra ?? 0);
}

function isPowerupActiveForMinute(
  matchTime: Date,
  minute: number | null | undefined,
  startsAt?: Date | null,
  endsAt?: Date | null
) {
  if (!startsAt || !endsAt || minute == null) return false;
  const eventAt = new Date(matchTime.getTime() + minute * 60_000);
  return eventAt >= startsAt && eventAt <= endsAt;
}

function addLine(
  lines: PlayerPointLine[],
  input: PlayerPointLine,
  matchTime: Date,
  powerupStartsAt?: Date | null,
  powerupEndsAt?: Date | null
) {
  const doubled = isPowerupActiveForMinute(
    matchTime,
    input.minute,
    powerupStartsAt,
    powerupEndsAt
  );
  lines.push({
    ...input,
    doubled,
    points: doubled ? input.points * 2 : input.points,
  });
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function statPoints(
  playerId: string,
  playerName: string,
  stats: NonNullable<ApiPlayerStatsRow["players"][number]["statistics"]>[number]
) {
  const lines: PlayerPointLine[] = [];
  const minutes = numberValue(stats.games?.minutes);
  const goals = numberValue(stats.goals?.total);
  const assists = numberValue(stats.goals?.assists);
  const saves = numberValue(stats.goals?.saves);
  const shotsOn = numberValue(stats.shots?.on);
  const keyPasses = numberValue(stats.passes?.key);
  const passes = numberValue(stats.passes?.total);
  const tackles = numberValue(stats.tackles?.total);
  const interceptions = numberValue(stats.tackles?.interceptions);
  const duelsWon = numberValue(stats.duels?.won);
  const foulsDrawn = numberValue(stats.fouls?.drawn);
  const foulsCommitted = numberValue(stats.fouls?.committed);
  const penaltyMissed = numberValue(stats.penalty?.missed);

  if (minutes > 0) {
    lines.push({ playerId, playerName, label: "Appearance", points: 1 });
  }
  if (goals > 0) {
    lines.push({ playerId, playerName, label: `Goals x${goals}`, points: goals * 8 });
  }
  if (assists > 0) {
    lines.push({ playerId, playerName, label: `Assists x${assists}`, points: assists * 5 });
  }
  if (shotsOn > 0) {
    lines.push({ playerId, playerName, label: `Shots on target x${shotsOn}`, points: shotsOn });
  }
  if (keyPasses > 0) {
    lines.push({ playerId, playerName, label: `Key passes x${keyPasses}`, points: keyPasses });
  }
  if (passes > 0) {
    lines.push({
      playerId,
      playerName,
      label: `Completed passes x${passes}`,
      points: Math.round(passes * 0.05 * 10) / 10,
    });
  }
  if (tackles > 0) {
    lines.push({ playerId, playerName, label: `Tackles x${tackles}`, points: tackles * 1.5 });
  }
  if (interceptions > 0) {
    lines.push({ playerId, playerName, label: `Interceptions x${interceptions}`, points: interceptions * 1.5 });
  }
  if (duelsWon > 0) {
    lines.push({
      playerId,
      playerName,
      label: `Duels won x${duelsWon}`,
      points: Math.round(duelsWon * 0.5 * 10) / 10,
    });
  }
  if (saves > 0) {
    lines.push({ playerId, playerName, label: `Saves x${saves}`, points: saves * 2 });
  }
  if (foulsDrawn > 0) {
    lines.push({
      playerId,
      playerName,
      label: `Fouls won x${foulsDrawn}`,
      points: Math.round(foulsDrawn * 0.5 * 10) / 10,
    });
  }
  if (foulsCommitted > 0) {
    lines.push({
      playerId,
      playerName,
      label: `Fouls committed x${foulsCommitted}`,
      points: -Math.round(foulsCommitted * 0.5 * 10) / 10,
    });
  }
  if (penaltyMissed > 0) {
    lines.push({ playerId, playerName, label: `Penalties missed x${penaltyMissed}`, points: penaltyMissed * -4 });
  }

  return lines;
}

function eventPointLines(
  event: ApiEventRow,
  playerApiToLocal: Map<string, { id: string; name: string }>,
  matchTime: Date,
  pickPowerups: Map<string, { startsAt: Date | null; endsAt: Date | null }>
) {
  const lines: PlayerPointLine[] = [];
  const minute = eventMinute(event);
  const detail = (event.detail ?? "").toLowerCase();
  const type = event.type;
  const playerApiId = event.player?.id != null ? String(event.player.id) : null;
  const assistApiId = event.assist?.id != null ? String(event.assist.id) : null;
  const player = playerApiId ? playerApiToLocal.get(playerApiId) : null;
  const assist = assistApiId ? playerApiToLocal.get(assistApiId) : null;

  if (type === "Goal" && player && !detail.includes("missed")) {
    const base = detail.includes("own") ? -5 : 8;
    const powerup = pickPowerups.get(player.id);
    addLine(
      lines,
      {
        playerId: player.id,
        playerName: player.name,
        label: detail.includes("penalty") ? "Penalty goal" : detail.includes("own") ? "Own goal" : "Goal",
        points: base,
        minute,
      },
      matchTime,
      powerup?.startsAt,
      powerup?.endsAt
    );
  }

  if (type === "Goal" && assist && !detail.includes("own")) {
    const powerup = pickPowerups.get(assist.id);
    addLine(
      lines,
      {
        playerId: assist.id,
        playerName: assist.name,
        label: "Assist",
        points: 5,
        minute,
      },
      matchTime,
      powerup?.startsAt,
      powerup?.endsAt
    );
  }

  if (type === "Card" && player) {
    const isRed = detail.includes("red");
    const powerup = pickPowerups.get(player.id);
    addLine(
      lines,
      {
        playerId: player.id,
        playerName: player.name,
        label: isRed ? "Red card" : "Yellow card",
        points: isRed ? -6 : -2,
        minute,
      },
      matchTime,
      powerup?.startsAt,
      powerup?.endsAt
    );
  }

  return lines;
}

function sumPoints(lines: PlayerPointLine[]) {
  return Math.round(lines.reduce((sum, line) => sum + line.points, 0) * 10) / 10;
}

async function loadMatch(matchId: string) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      homeTeam: true,
      awayTeam: true,
      round: true,
    },
  });
  if (!match) throw new Error("Match not found");
  return match;
}

async function loadFanClashLineup(match: Awaited<ReturnType<typeof loadMatch>>) {
  const fallbackLineup = async () => {
    const [homePlayers, awayPlayers] = await Promise.all([
      prisma.player.findMany({
        where: { teamId: match.homeTeamId },
        orderBy: [{ shirtNumber: "asc" }, { name: "asc" }],
        take: 26,
      }),
      prisma.player.findMany({
        where: { teamId: match.awayTeamId },
        orderBy: [{ shirtNumber: "asc" }, { name: "asc" }],
        take: 26,
      }),
    ]);

    const mapPlayers = (players: typeof homePlayers) =>
      players.map((player, index) => ({
        id: player.id,
        name: player.name,
        position: player.position,
        shirtNumber: player.shirtNumber,
        photoUrl: player.photoUrl,
        section: index < 11 ? ("lineup" as const) : ("bench" as const),
        grid: null,
      }));

    return {
      home: {
        formation: null,
        source: "estimated" as const,
        players: mapPlayers(homePlayers),
      },
      away: {
        formation: null,
        source: "estimated" as const,
        players: mapPlayers(awayPlayers),
      },
      lineupStatus: "estimated" as const,
    };
  };

  try {
    const lineup = await getMatchLineup(match.id, { fresh: match.status === "LIVE" });
    const normalized = lineup as
      | {
          home?: { players?: unknown[]; source?: string; formation?: string | null };
          away?: { players?: unknown[]; source?: string; formation?: string | null };
          homePlayers?: unknown[];
          awayPlayers?: unknown[];
          lineupStatus?: string;
        }
      | null;
    const homePlayers = normalized?.home?.players ?? normalized?.homePlayers;
    const awayPlayers = normalized?.away?.players ?? normalized?.awayPlayers;
    if (!Array.isArray(homePlayers) || !Array.isArray(awayPlayers)) {
      return fallbackLineup();
    }
    return {
      home: {
        formation: normalized?.home?.formation ?? null,
        source: (normalized?.home?.source ?? "estimated") as "official" | "probable" | "estimated",
        players: homePlayers,
      },
      away: {
        formation: normalized?.away?.formation ?? null,
        source: (normalized?.away?.source ?? "estimated") as "official" | "probable" | "estimated",
        players: awayPlayers,
      },
      lineupStatus: (normalized?.lineupStatus ?? "estimated") as "official" | "probable" | "estimated",
    };
  } catch {
    return fallbackLineup();
  }
}

export async function listFanClashMatches() {
  const now = Date.now();
  const matches = await prisma.match.findMany({
    where: {
      matchTime: {
        gte: new Date(now - 3 * 60 * 60 * 1000),
        lte: new Date(now + 10 * 24 * 60 * 60 * 1000),
      },
      status: { in: ["SCHEDULED", "LIVE", "FINISHED"] },
    },
    include: {
      homeTeam: true,
      awayTeam: true,
      round: true,
    },
    orderBy: { matchTime: "asc" },
    take: 24,
  });
  return dedupeFanClashMatches(matches);
}

export async function getFanClashState(matchId: string, userId: string) {
  const match = await loadMatch(matchId);
  const lineup = await loadFanClashLineup(match);
  const picks = await prisma.fanClashPick.findMany({
    where: { userId, matchId },
    include: { player: { include: { team: true } } },
    orderBy: { createdAt: "asc" },
  });
  const allPicks = await prisma.fanClashPick.findMany({
    where: { matchId },
    include: { user: true, player: true },
  });
  const pickedUserIds = Array.from(new Set(allPicks.map((pick) => pick.userId)));

  const apiPlayerIds = Array.from(
    new Set(
      allPicks
        .map((pick) => pick.player.apiPlayerId)
        .filter((value): value is string => !!value)
    )
  );
  const apiPlayerRows = await prisma.player.findMany({
    where: { apiPlayerId: { in: apiPlayerIds } },
    select: { id: true, apiPlayerId: true, name: true },
  });
  const apiToLocal = new Map(
    apiPlayerRows.flatMap((player) =>
      player.apiPlayerId ? [[player.apiPlayerId, { id: player.id, name: player.name }] as const] : []
    )
  );

  let liveData: Awaited<ReturnType<typeof fetchLiveData>> = {
    events: [],
    stats: [],
  };
  let sourceError: string | null = null;
  let quotaExhausted = false;
  if (match.apiMatchId && apiFootballConfigured()) {
    try {
      liveData = await fetchLiveData(match.apiMatchId, match.status);
    } catch (error) {
      sourceError = error instanceof Error ? error.message : "Live source failed";
      quotaExhausted = sourceError.includes("quota is exhausted");
    }
  }

  const pickPowerups = new Map(
    allPicks.map((pick) => [
      pick.playerId,
      {
        startsAt: pick.powerupStartsAt,
        endsAt: pick.powerupEndsAt,
      },
    ])
  );

  const eventLines = liveData.events.flatMap((event) =>
    eventPointLines(event, apiToLocal, match.matchTime, pickPowerups)
  );

  const statLines = liveData.stats.flatMap((team) =>
    (team.players ?? []).flatMap((row) => {
      const apiId = row.player.id != null ? String(row.player.id) : null;
      const local = apiId ? apiToLocal.get(apiId) : null;
      if (!local) return [];
      return statPointLinesWithoutEventDuplicates(
        local.id,
        local.name,
        row.statistics?.[0]
      );
    })
  );

  const lines = [...eventLines, ...statLines];
  const playerScores = new Map<string, { total: number; lines: PlayerPointLine[] }>();
  for (const line of lines) {
    const bucket = playerScores.get(line.playerId) ?? { total: 0, lines: [] };
    bucket.lines.push(line);
    bucket.total = sumPoints(bucket.lines);
    playerScores.set(line.playerId, bucket);
  }

  const leaderboard = pickedUserIds
    .map((entryUserId) => {
      const userPicks = allPicks.filter((pick) => pick.userId === entryUserId);
      return {
        userId: entryUserId,
        username: userPicks[0]?.user.username ?? "Player",
        points: sumPoints(
          userPicks.flatMap((pick) => playerScores.get(pick.playerId)?.lines ?? [])
        ),
      };
    })
    .sort((a, b) => b.points - a.points)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

  return {
    configured: apiFootballConfigured(),
    quotaExhausted,
    availableApiKeys: getAvailableFanClashApiKeys().length,
    sourceError,
    match: {
      id: match.id,
      apiMatchId: match.apiMatchId,
      status: match.status,
      statusText: match.status,
      elapsed:
        match.status === "LIVE"
          ? Math.max(0, Math.floor((Date.now() - match.matchTime.getTime()) / 60_000))
          : null,
      matchTime: match.matchTime,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      round: match.round,
    },
    lineup,
    picks: picks.map((pick) => ({
      id: pick.id,
      playerId: pick.playerId,
      playerName: pick.player.name,
      teamName: pick.player.team.name,
      photoUrl: pick.player.photoUrl,
      powerupStartsAt: pick.powerupStartsAt,
      powerupEndsAt: pick.powerupEndsAt,
      points: playerScores.get(pick.playerId)?.total ?? 0,
      lines: playerScores.get(pick.playerId)?.lines ?? [],
    })),
    leaderboard,
    feed: lines
      .filter((line) => line.minute != null)
      .sort((a, b) => (b.minute ?? 0) - (a.minute ?? 0))
      .slice(0, 40),
    scoringRules: [
      "Goal +8",
      "Assist +5",
      "Yellow card -2",
      "Red card -6",
      "Powerup doubles event points for 10 minutes",
      "Player statistics count when API-Football returns fixture player stats",
    ],
  };
}

function statPointLinesWithoutEventDuplicates(
  playerId: string,
  playerName: string,
  stats?: NonNullable<ApiPlayerStatsRow["players"][number]["statistics"]>[number]
) {
  if (!stats) return [];
  return statPoints(playerId, playerName, {
    ...stats,
    goals: {
      ...stats.goals,
      total: 0,
      assists: 0,
    },
    cards: {
      yellow: 0,
      red: 0,
    },
  });
}

export async function saveFanClashPicks(
  matchId: string,
  userId: string,
  playerIds: string[]
) {
  const match = await loadMatch(matchId);
  if (match.status !== "SCHEDULED" || match.matchTime <= new Date()) {
    throw new Error("Fan Clash picks lock when the match starts");
  }
  const uniquePlayerIds = Array.from(new Set(playerIds)).slice(0, MAX_PICKS);
  if (uniquePlayerIds.length === 0 || uniquePlayerIds.length > MAX_PICKS) {
    throw new Error(`Choose between 1 and ${MAX_PICKS} players`);
  }

  const players = await prisma.player.findMany({
    where: {
      id: { in: uniquePlayerIds },
      teamId: { in: [match.homeTeamId, match.awayTeamId] },
    },
    select: { id: true },
  });
  if (players.length !== uniquePlayerIds.length) {
    throw new Error("One or more players are not in this match");
  }

  await prisma.$transaction([
    prisma.fanClashPick.deleteMany({ where: { userId, matchId } }),
    ...uniquePlayerIds.map((playerId) =>
      prisma.fanClashPick.create({
        data: { userId, matchId, playerId },
      })
    ),
  ]);
}

export async function activateFanClashPowerup(
  matchId: string,
  userId: string,
  playerId: string
) {
  const match = await loadMatch(matchId);
  const pick = await prisma.fanClashPick.findUnique({
    where: { userId_matchId_playerId: { userId, matchId, playerId } },
  });
  if (!pick) throw new Error("Pick this player before using a powerup");

  const alreadyUsed = await prisma.fanClashPick.findFirst({
    where: {
      userId,
      matchId,
      powerupStartsAt: { not: null },
    },
  });
  if (alreadyUsed && alreadyUsed.playerId !== playerId) {
    throw new Error("Powerup already used for this match");
  }
  if (pick.powerupStartsAt) return;

  const now = new Date();
  const startsAt = now < match.matchTime ? match.matchTime : now;
  const endsAt = new Date(startsAt.getTime() + POWERUP_MINUTES * 60_000);
  await prisma.fanClashPick.update({
    where: { id: pick.id },
    data: { powerupStartsAt: startsAt, powerupEndsAt: endsAt },
  });
}
