import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

type UsageMatch = {
  id: string;
  roundId: string;
  homeTeamId: string;
  awayTeamId: string;
  matchTime: Date;
  stageName: string | null;
  groupCode: string | null;
  homeTeam?: { name: string };
  awayTeam?: { name: string };
};

export type UsageRoundScope = {
  key: string;
  matchIds: string[];
  databaseRoundId: string;
};

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

export function buildUsageRoundKey(
  match: UsageMatch,
  roundMatches: UsageMatch[]
): string {
  if (!isGroupMatch(match)) {
    return `${match.roundId}:stage:${stageKey(match.stageName)}`;
  }

  const group = normalizedGroupCode(match.groupCode);
  if (group) {
    const groupMatches = roundMatches
      .filter((candidate) => normalizedGroupCode(candidate.groupCode) === group)
      .sort((a, b) => {
        const timeDiff = a.matchTime.getTime() - b.matchTime.getTime();
        return timeDiff !== 0 ? timeDiff : a.id.localeCompare(b.id);
      });

    const seen = new Map<string, number>();
    let distinctIndex = 0;
    for (const candidate of groupMatches) {
      const duplicateKey = `${candidate.matchTime.getTime()}:${pairUsageKey(candidate)}`;
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
        candidate.matchTime < match.matchTime &&
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
} as const;

const getCachedUsageMatch = unstable_cache(
  (matchId: string) =>
    prisma.match.findUniqueOrThrow({
      where: { id: matchId },
      select: usageMatchSelect,
    }),
  ["usage-match-v3"],
  { revalidate: 300, tags: ["matches-schedule"] }
);

const getCachedUsageRoundMatches = unstable_cache(
  (roundId: string) =>
    prisma.match.findMany({
      where: { roundId },
      select: usageMatchSelect,
    }),
  ["usage-round-matches-v3"],
  { revalidate: 300, tags: ["matches-schedule"] }
);

export async function getUsageRoundScope(
  matchId: string,
  knownRoundId?: string
): Promise<UsageRoundScope> {
  const matchPromise = getCachedUsageMatch(matchId);
  const [match, knownRoundMatches] = await Promise.all([
    matchPromise,
    knownRoundId
      ? getCachedUsageRoundMatches(knownRoundId)
      : Promise.resolve(null),
  ]);
  const roundMatches =
    knownRoundMatches ?? (await getCachedUsageRoundMatches(match.roundId));
  const key = buildUsageRoundKey(match, roundMatches);
  const matchIds = roundMatches
    .filter((candidate) => buildUsageRoundKey(candidate, roundMatches) === key)
    .map((candidate) => candidate.id);

  return {
    key,
    matchIds,
    databaseRoundId: match.roundId,
  };
}
