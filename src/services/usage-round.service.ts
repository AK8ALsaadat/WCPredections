import { unstable_cache } from "next/cache";
import { isTournamentRoundName } from "@/lib/rounds";
import { getBracketByApiMatchId, getBracketRoundLabel } from "@/lib/wc-bracket";
import { prisma } from "@/lib/prisma";

export type UsageMatch = {
  id: string;
  apiMatchId: string | null;
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
  startsAt: Date;
  hasStarted: boolean;
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
  return phase === "group" ? 2 : 1;
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

function specificKnockoutPhaseFromMatch(
  match: Pick<UsageMatch, "apiMatchId" | "stageName" | "round">
): UsageRoundPhase | null {
  const stagePhase = knockoutPhaseFromKey(stageKey(match.stageName));
  if (stagePhase) return stagePhase;

  const bracket = getBracketByApiMatchId(match.apiMatchId);
  const bracketLabel = bracket ? getBracketRoundLabel(bracket.matchNo) : null;
  const bracketPhase = bracketLabel
    ? knockoutPhaseFromKey(stageKey(bracketLabel))
    : null;
  if (bracketPhase) return bracketPhase;

  return knockoutPhaseFromKey(stageKey(match.round?.name ?? null));
}

export function getUsageCompetitionKey(): string {
  return process.env.USAGE_COMPETITION_KEY?.trim() || "wc";
}

function usageKeyPrefix() {
  return getUsageCompetitionKey();
}

function isLikelyWorldCupRoundName(name: string | null | undefined) {
  if (!name) return false;
  const normalized = name.trim().toLowerCase();
  return (
    isTournamentRoundName(name) ||
    normalized.includes("world cup") ||
    normalized.includes("fifa") ||
    name.includes("كأس العالم")
  );
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

function unorderedPairUsageKey(match: UsageMatch) {
  return [
    teamUsageKey(match.homeTeam, match.homeTeamId),
    teamUsageKey(match.awayTeam, match.awayTeamId),
  ]
    .sort()
    .join("|");
}

function isGroupMatch(match: UsageMatch): boolean {
  return Boolean(normalizedGroupCode(match.groupCode)) || isGroupStage(match.stageName);
}

function knockoutPhaseFromIndex(
  index: number,
  total: number,
  startsAtRoundOf32: boolean
): UsageRoundPhase {
  if (startsAtRoundOf32 || total >= 32) {
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

function dedupeKnockoutMatchesForOrdering(knockoutMatches: UsageMatch[]) {
  const duplicateWindowMs = 6 * 60 * 60 * 1000;
  const canonicalMatches: UsageMatch[] = [];
  const duplicateToCanonical = new Map<string, string>();

  for (const candidate of knockoutMatches) {
    const pairKey = unorderedPairUsageKey(candidate);
    const candidateTime = matchTimeMs(candidate.matchTime);
    const duplicate = canonicalMatches.find(
      (canonical) =>
        unorderedPairUsageKey(canonical) === pairKey &&
        Math.abs(matchTimeMs(canonical.matchTime) - candidateTime) <=
          duplicateWindowMs
    );

    if (duplicate) {
      duplicateToCanonical.set(candidate.id, duplicate.id);
      continue;
    }

    canonicalMatches.push(candidate);
  }

  return { canonicalMatches, duplicateToCanonical };
}

function shouldStartKnockoutAtRoundOf32(knockoutMatches: UsageMatch[]) {
  return knockoutMatches.some(
    (candidate) =>
      specificKnockoutPhaseFromMatch(candidate) === "round-of-32" ||
      isLikelyWorldCupRoundName(candidate.round?.name)
  );
}

function knockoutFallbackUsageKey(match: UsageMatch, roundMatches: UsageMatch[]) {
  const knockoutMatches = roundMatches
    .filter((candidate) => !isGroupMatch(candidate))
    .sort((a, b) => {
      const timeDiff = matchTimeMs(a.matchTime) - matchTimeMs(b.matchTime);
      return timeDiff !== 0 ? timeDiff : a.id.localeCompare(b.id);
    });
  const { canonicalMatches, duplicateToCanonical } =
    dedupeKnockoutMatchesForOrdering(knockoutMatches);
  const canonicalMatchId = duplicateToCanonical.get(match.id) ?? match.id;
  const startsAtRoundOf32 =
    canonicalMatches.length > 16 ||
    shouldStartKnockoutAtRoundOf32(canonicalMatches);
  const index = Math.max(
    0,
    canonicalMatches.findIndex((candidate) => candidate.id === canonicalMatchId)
  );

  return `${usageKeyPrefix()}:stage:${knockoutPhaseFromIndex(
    index,
    canonicalMatches.length,
    startsAtRoundOf32
  )}`;
}

export function buildUsageRoundKey(
  match: UsageMatch,
  roundMatches: UsageMatch[]
): string {
  if (!isGroupMatch(match)) {
    const phase = specificKnockoutPhaseFromMatch(match);
    if (phase) {
      return `${usageKeyPrefix()}:stage:${phase}`;
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
        return `${usageKeyPrefix()}:group-gameweek:${Math.floor(candidateIndex / 2) + 1}`;
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

  return `${usageKeyPrefix()}:group-gameweek:${gameweek}`;
}

const usageMatchSelect = {
  id: true,
  apiMatchId: true,
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

async function fetchUsageCompetitionMatches() {
  const rounds = await prisma.round.findMany({
    select: {
      id: true,
      name: true,
      _count: { select: { matches: true } },
    },
  });
  const roundIds = rounds
    .filter(
      (round) =>
        round._count.matches >= 10 || isLikelyWorldCupRoundName(round.name)
    )
    .map((round) => round.id);

  if (roundIds.length === 0) return [];

  return prisma.match.findMany({
    where: { roundId: { in: roundIds } },
    select: usageMatchSelect,
  });
}

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
const usageCompetitionMatchesMemoryCache = new Map<
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

async function getUsageCompetitionMatches() {
  const cacheKey = usageKeyPrefix();
  const cached = getFreshCacheValue(
    usageCompetitionMatchesMemoryCache,
    cacheKey
  );
  if (cached) return cached;

  const matches = await fetchUsageCompetitionMatches();
  setFreshCacheValue(usageCompetitionMatchesMemoryCache, cacheKey, matches);
  return matches;
}

function shouldUseCompetitionScope(
  match: UsageMatch,
  roundMatches: UsageMatch[]
) {
  if (roundMatches.length >= 10 || isLikelyWorldCupRoundName(match.round?.name)) {
    return true;
  }

  return roundMatches.some((candidate) =>
    isLikelyWorldCupRoundName(candidate.round?.name)
  );
}

async function getFreshRoundMatches(roundId: string) {
  const matches = await fetchUsageRoundMatches(roundId);
  setFreshCacheValue(usageRoundMatchesMemoryCache, roundId, matches);
  return matches;
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
  let roundMatches =
    knownRoundMatches ?? (await getUsageRoundMatches(match.roundId));
  if (!roundMatches.some((candidate) => candidate.id === match.id)) {
    roundMatches = await getFreshRoundMatches(match.roundId);
  }
  if (!isGroupMatch(match) || shouldUseCompetitionScope(match, roundMatches)) {
    roundMatches = await getFreshRoundMatches(match.roundId);
  }
  if (shouldUseCompetitionScope(match, roundMatches)) {
    const competitionMatches = await getUsageCompetitionMatches();
    if (competitionMatches.some((candidate) => candidate.id === match.id)) {
      roundMatches = competitionMatches;
    }
  }
  const key = buildUsageRoundKey(match, roundMatches);
  const scopedMatches = roundMatches.filter(
    (candidate) => buildUsageRoundKey(candidate, roundMatches) === key
  );
  const scopedMatchIds = scopedMatches.map((candidate) => candidate.id);
  const matchIds = scopedMatchIds.includes(match.id)
    ? scopedMatchIds
    : [...scopedMatchIds, match.id];
  const startsAtMs = Math.min(
    ...[...scopedMatches, match].map((candidate) =>
      matchTimeMs(candidate.matchTime)
    )
  );
  const startsAt = new Date(startsAtMs);

  const scope = {
    key,
    matchIds,
    databaseRoundId: match.roundId,
    startsAt,
    hasStarted: Number.isFinite(startsAtMs) && startsAtMs <= Date.now(),
  };
  setFreshCacheValue(usageScopeMemoryCache, cacheKey, scope);
  return scope;
}
