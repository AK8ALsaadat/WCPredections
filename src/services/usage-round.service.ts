import { prisma } from "@/lib/prisma";

type UsageMatch = {
  id: string;
  roundId: string;
  homeTeamId: string;
  awayTeamId: string;
  matchTime: Date;
  stageName: string | null;
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

export async function getUsageRoundScope(matchId: string) {
  const match = await prisma.match.findUniqueOrThrow({
    where: { id: matchId },
    select: {
      id: true,
      roundId: true,
      homeTeamId: true,
      awayTeamId: true,
      matchTime: true,
      stageName: true,
    },
  });

  const roundMatches = await prisma.match.findMany({
    where: { roundId: match.roundId },
    select: {
      id: true,
      roundId: true,
      homeTeamId: true,
      awayTeamId: true,
      matchTime: true,
      stageName: true,
    },
  });
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
