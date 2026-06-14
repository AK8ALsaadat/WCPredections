import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

type UsageMatch = {
  id: string;
  roundId: string;
  homeTeamId: string;
  awayTeamId: string;
  matchTime: Date;
  stageName: string | null;
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

export function buildUsageRoundKey(
  match: UsageMatch,
  roundMatches: UsageMatch[]
): string {
  if (!isGroupStage(match.stageName)) {
    return `${match.roundId}:stage:${stageKey(match.stageName)}`;
  }

  const previousMatchesForTeam = (teamId: string) =>
    roundMatches.filter(
      (candidate) =>
        isGroupStage(candidate.stageName) &&
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
} as const;

const getCachedUsageMatch = unstable_cache(
  (matchId: string) =>
    prisma.match.findUniqueOrThrow({
      where: { id: matchId },
      select: usageMatchSelect,
    }),
  ["usage-match-v2"],
  { revalidate: 300, tags: ["matches-schedule"] }
);

const getCachedUsageRoundMatches = unstable_cache(
  (roundId: string) =>
    prisma.match.findMany({
      where: { roundId },
      select: usageMatchSelect,
    }),
  ["usage-round-matches-v2"],
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
