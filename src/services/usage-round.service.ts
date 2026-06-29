import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

export type UsageMatch = {
  id: string;
  roundId: string;
  homeTeamId: string;
  awayTeamId: string;
  matchTime: Date | string;
  stageName: string | null;
  groupCode: string | null;
  homeTeam?: { name: string };
  awayTeam?: { name: string };
  round?: { name: string };
};

export type UsageRoundScope = {
  key: string;
  matchIds: string[];
  databaseRoundId: string;
};

export type UsageRoundPhase =
  | "group"
  | "round-of-32"
  | "round-of-16"
  | "quarter-finals"
  | "semi-finals"
  | "third-place-final"
  | "final";

function knockoutPhaseFromKey(key: string): UsageRoundPhase | null {
  const normalized = key.toLowerCase();

  if (
    normalized.includes("round-of-32") ||
    normalized.includes("round-32") ||
    normalized.includes("last-32") ||
    normalized.includes("r32")
  ) {
    return "round-of-32";
  }

  if (
    normalized.includes("round-of-16") ||
    normalized.includes("round-16") ||
    normalized.includes("last-16") ||
    normalized.includes("r16")
  ) {
    return "round-of-16";
  }

  if (normalized.includes("quarter")) return "quarter-finals";
  if (normalized.includes("semi")) return "semi-finals";
  if (normalized.includes("third-place")) return "third-place-final";

  if (
    normalized === "final" ||
    normalized.endsWith(":final") ||
    normalized.includes("-final") ||
    normalized.includes("grand-final")
  ) {
    return "final";
  }

  return null;
}

export function getUsageRoundPhase(
  scopeOrKey: string | UsageRoundScope
): UsageRoundPhase {
  const key = typeof scopeOrKey === "string" ? scopeOrKey : scopeOrKey.key;
  return knockoutPhaseFromKey(key) ?? "group";
}

export function isHighValueBoldScorerRound(
  scopeOrKey: string | UsageRoundScope
): boolean {
  const phase = getUsageRoundPhase(scopeOrKey);
  return (
    phase === "quarter-finals" ||
    phase === "semi-finals" ||
    phase === "third-place-final" ||
    phase === "final"
  );
}

export function getMaxDoublesForUsageScope(
  scopeOrKey: string | UsageRoundScope
): number {
  const phase = getUsageRoundPhase(scopeOrKey);
  return phase === "round-of-32" ||
    phase === "round-of-16" ||
    phase === "quarter-finals" ||
    phase === "semi-finals" ||
    phase === "third-place-final" ||
    phase === "final"
    ? 1
    : 2;
}

export function canCombineDoubleAndBoldForUsageScope(
  scopeOrKey: string | UsageRoundScope
): boolean {
  return isHighValueBoldScorerRound(scopeOrKey);
}

function stageKey(stageName: string | null): string {
  return (stageName ?? "default")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function isGroupStage(stageName: string | null): boolean {
  return stageKey(stageName).includes("group");
}

function hasSpecificKnockoutStage(stageName: string | null): boolean {
  const key = stageKey(stageName);
  return knockoutPhaseFromKey(key) != null;
}

function matchTimeMs(matchTime: Date | string): number {
  return matchTime instanceof Date
    ? matchTime.getTime()
    : new Date(matchTime).getTime();
}

function normalizedGroupCode(groupCode: string | null): string | null {
  if (!groupCode) return null;
  const normalized = groupCode
    .trim()
    .toUpperCase()
    .replace(/^GROUP[_\-\s]*/, "");
  return normalized || null;
}

function teamUsageKey(team?: { name: string } | null, fallbackId?: string) {
  const key = (team?.name ?? fallbackId ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const aliases: Record<string, string> = {
    "united-states": "usa",
    us: "usa",
    "u-s-a": "usa",
    turkiye: "turkey",
    "ir-iran": "iran",
    "cape-verde-islands": "cape-verde",
    "cabo-verde": "cape-verde",
    curacao: "curacao",
    "democratic-republic-of-the-congo": "congo-dr",
    "dr-congo": "congo-dr",
    "congo-d-r": "congo-dr",
  };

  return aliases[key] ?? key;
}

function pairUsageKey(match: UsageMatch) {
  return [
    teamUsageKey(match.homeTeam, match.homeTeamId),
    teamUsageKey(match.awayTeam, match.awayTeamId),
  ].join("|");
}

function isGroupMatch(match: UsageMatch): boolean {
  return Boolean(normalizedGroupCode(match.groupCode)) || isGroupStage(match.stageName);
}

function knockoutPhaseFromIndex(index: number, total: number): string {
  if (total >= 32) {
    if (index < 16) return "round-of-32";
    if (index < 24) return "round-of-16";
    if (index < 28) return "quarter-finals";
    if (index < 30) return "semi-finals";
    if (index === 30) return "third-place-final";
    return "final";
  }

  if (total >= 16) {
    if (index < 8) return "round-of-16";
    if (index < 12) return "quarter-finals";
    if (index < 14) return "semi-finals";
    if (index === 14) return "third-place-final";
    return "final";
  }

  if (total >= 8) {
    if (index < 4) return "quarter-finals";
    if (index < 6) return "semi-finals";
    if (index === 6) return "third-place-final";
    return "final";
  }

  if (total >= 4) {
    if (index < 2) return "semi-finals";
    if (index === 2) return "third-place-final";
    return "final";
  }

  return index === 0 && total > 1 ? "third-place-final" : "final";
}

function knockoutFallbackUsageKey(match: UsageMatch, roundMatches: UsageMatch[]) {
  const knockoutMatches = roundMatches
    .filter((candidate) => !isGroupMatch(candidate))
    .sort((a, b) => {
      const timeDiff = matchTimeMs(a.matchTime) - matchTimeMs(b.matchTime);
      return timeDiff !== 0 ? timeDiff : a.id.localeCompare(b.id);
    });
  const index = Math.max(
    0,
    knockoutMatches.findIndex((candidate) => candidate.id === match.id)
  );

  return `${match.roundId}:knockout:${knockoutPhaseFromIndex(index, knockoutMatches.length)}`;
}

export function buildUsageRoundKey(
  match: UsageMatch,
  roundMatches: UsageMatch[]
): string {
  if (!isGroupMatch(match)) {
    if (hasSpecificKnockoutStage(match.stageName)) {
      return `${match.roundId}:stage:${stageKey(match.stageName)}`;
    }

    if (hasSpecificKnockoutStage(match.round?.name ?? null)) {
      return `${match.roundId}:stage:${stageKey(match.round?.name ?? null)}`;
    }

    return knockoutFallbackUsageKey(match, roundMatches);
  }

  const group = normalizedGroupCode(match.groupCode);
  if (group) {
    const groupMatches = roundMatches
      .filter((candidate) => normalizedGroupCode(candidate.groupCode) === group)
      .sort((a, b) => {
        const timeDiff = matchTimeMs(a.matchTime) - matchTimeMs(b.matchTime);
        return timeDiff !== 0 ? timeDiff : a.id.localeCompare(b.id);
      });

    const seen = new Map<string, number>();
    let distinctIndex = 0;
    for (const candidate of groupMatches) {
      const duplicateKey = `${matchTimeMs(candidate.matchTime)}:${pairUsageKey(candidate)}`;
      const existingIndex = seen.get(duplicateKey);
      const candidateIndex = existingIndex ?? distinctIndex;
      if (existingIndex == null) {
        seen.set(duplicateKey, distinctIndex);
        distinctIndex += 1;
      }
      if (candidate.id === match.id) {
        return `${match.roundId}:group-gameweek:${Math.floor(candidateIndex / 2) + 1}`;
      }
    }
  }

  const previousMatchesForTeam = (teamId: string) =>
    roundMatches.filter(
      (candidate) =>
        isGroupMatch(candidate) &&
        matchTimeMs(candidate.matchTime) < matchTimeMs(match.matchTime) &&
        (candidate.homeTeamId === teamId || candidate.awayTeamId === teamId)
    ).length;

  const gameweek =
    Math.max(
      previousMatchesForTeam(match.homeTeamId),
      previousMatchesForTeam(match.awayTeamId)
    ) + 1;

  return `${match.roundId}:group-gameweek:${gameweek}`;
}

const usageMatchSelect = {
  id: true,
  roundId: true,
  homeTeamId: true,
  awayTeamId: true,
  matchTime: true,
  stageName: true,
  groupCode: true,
  homeTeam: { select: { name: true } },
  awayTeam: { select: { name: true } },
  round: { select: { name: true } },
} as const;

const fetchUsageMatch = (matchId: string) =>
  prisma.match.findUniqueOrThrow({
    where: { id: matchId },
    select: usageMatchSelect,
  });

const fetchUsageRoundMatches = (roundId: string) =>
  prisma.match.findMany({
    where: { roundId },
    select: usageMatchSelect,
  });

const getCachedUsageMatch = unstable_cache(
  fetchUsageMatch,
  ["usage-match-v4"],
  { revalidate: 300, tags: ["matches-schedule"] }
);

const getCachedUsageRoundMatches = unstable_cache(
  fetchUsageRoundMatches,
  ["usage-round-matches-v4"],
  { revalidate: 300, tags: ["matches-schedule"] }
);

const USAGE_SCOPE_MEMORY_CACHE_MS = 5 * 60 * 1000;
const usageMatchMemoryCache = new Map<
  string,
  { data: UsageMatch; expiresAt: number }
>();
const usageRoundMatchesMemoryCache = new Map<
  string,
  { data: UsageMatch[]; expiresAt: number }
>();
const usageScopeMemoryCache = new Map<
  string,
  { data: UsageRoundScope; expiresAt: number }
>();

function getFreshCacheValue<T>(
  cache: Map<string, { data: T; expiresAt: number }>,
  key: string
): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setFreshCacheValue<T>(
  cache: Map<string, { data: T; expiresAt: number }>,
  key: string,
  data: T
) {
  cache.set(key, {
    data,
    expiresAt: Date.now() + USAGE_SCOPE_MEMORY_CACHE_MS,
  });
}

export function primeUsageMatchCache(match: UsageMatch) {
  setFreshCacheValue(usageMatchMemoryCache, match.id, match);
}

export function primeUsageRoundMatchesCache(
  roundId: string,
  matches: UsageMatch[]
) {
  setFreshCacheValue(usageRoundMatchesMemoryCache, roundId, matches);
  for (const match of matches) {
    setFreshCacheValue(usageMatchMemoryCache, match.id, match);
  }
}

function isMissingNextIncrementalCache(error: unknown) {
  return (
    error instanceof Error &&
    error.message.includes("incrementalCache missing")
  );
}

async function getUsageMatch(matchId: string) {
  const cached = getFreshCacheValue(usageMatchMemoryCache, matchId);
  if (cached) return cached;

  try {
    const match = await getCachedUsageMatch(matchId);
    setFreshCacheValue(usageMatchMemoryCache, matchId, match);
    return match;
  } catch (error) {
    if (isMissingNextIncrementalCache(error)) {
      const match = await fetchUsageMatch(matchId);
      setFreshCacheValue(usageMatchMemoryCache, matchId, match);
      return match;
    }
    throw error;
  }
}

async function getUsageRoundMatches(roundId: string) {
  const cached = getFreshCacheValue(usageRoundMatchesMemoryCache, roundId);
  if (cached) return cached;

  try {
    const matches = await getCachedUsageRoundMatches(roundId);
    setFreshCacheValue(usageRoundMatchesMemoryCache, roundId, matches);
    return matches;
  } catch (error) {
    if (isMissingNextIncrementalCache(error)) {
      const matches = await fetchUsageRoundMatches(roundId);
      setFreshCacheValue(usageRoundMatchesMemoryCache, roundId, matches);
      return matches;
    }
    throw error;
  }
}

export async function getUsageRoundScope(
  matchId: string,
  knownRoundId?: string
): Promise<UsageRoundScope> {
  const cacheKey = `${matchId}:${knownRoundId ?? "auto"}`;
  const cached = getFreshCacheValue(usageScopeMemoryCache, cacheKey);
  if (cached) return cached;

  const matchPromise = getUsageMatch(matchId);
  const [match, knownRoundMatches] = await Promise.all([
    matchPromise,
    knownRoundId
      ? getUsageRoundMatches(knownRoundId)
      : Promise.resolve(null),
  ]);
  const roundMatches =
    knownRoundMatches ?? (await getUsageRoundMatches(match.roundId));
  const key = buildUsageRoundKey(match, roundMatches);
  const matchIds = roundMatches
    .filter((candidate) => buildUsageRoundKey(candidate, roundMatches) === key)
    .map((candidate) => candidate.id);

  const scope = {
    key,
    matchIds,
    databaseRoundId: match.roundId,
  };
  setFreshCacheValue(usageScopeMemoryCache, cacheKey, scope);
  return scope;
}
