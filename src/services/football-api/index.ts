import { prisma } from "@/lib/prisma";
import { applyRemappedMatchState } from "@/lib/wc-dates";
import { advanceKnockoutTeams } from "@/services/knockout-advancement.service";
import { calculateMatchPoints } from "@/services/prediction.service";
import { ApiFootballProvider } from "./api-football.provider";
import { FootballDataProvider } from "./football-data.provider";
import type { ExternalMatch, FootballApiProvider, SyncOptions } from "./types";

export function getFootballApiProvider(): FootballApiProvider {
  const provider = process.env.FOOTBALL_API_PROVIDER ?? "api-football";

  switch (provider) {
    case "football-data":
      return new FootballDataProvider();
    case "api-football":
    default:
      return new ApiFootballProvider();
  }
}

async function upsertTeam(
  team: { apiId: string; name: string; shortName: string; logoUrl?: string }
) {
  return prisma.team.upsert({
    where: { apiTeamId: team.apiId },
    create: {
      apiTeamId: team.apiId,
      name: team.name,
      shortName: team.shortName,
      logoUrl: team.logoUrl,
    },
    update: {
      name: team.name,
      shortName: team.shortName,
      logoUrl: team.logoUrl,
    },
  });
}

async function syncTeams(provider: FootballApiProvider, options: SyncOptions) {
  const teams = await provider.fetchTeams(options);
  const results = [];

  for (const team of teams) {
    results.push(await upsertTeam(team));
  }

  return results;
}

async function syncPlayers(
  provider: FootballApiProvider,
  options: SyncOptions
) {
  const teams = await prisma.team.findMany({
    where: { apiTeamId: { not: null } },
  });

  let count = 0;

  for (const team of teams) {
    if (!team.apiTeamId) continue;

    const players = await provider.fetchPlayers(team.apiTeamId, options);

    for (const player of players) {
      await prisma.player.upsert({
        where: {
          teamId_apiPlayerId: {
            teamId: team.id,
            apiPlayerId: player.apiId,
          },
        },
        create: {
          teamId: team.id,
          name: player.name,
          apiPlayerId: player.apiId,
        },
        update: { name: player.name },
      });
      count++;
    }
  }

  return count;
}

async function resolveTeamId(
  apiTeamId: string,
  fallback?: { name: string; shortName?: string }
): Promise<string | null> {
  const team = await prisma.team.findUnique({
    where: { apiTeamId },
  });
  if (team) return team.id;

  if (!fallback?.name) return null;

  const created = await prisma.team.upsert({
    where: { apiTeamId },
    create: {
      apiTeamId,
      name: fallback.name,
      shortName:
        fallback.shortName ?? fallback.name.slice(0, 3).toUpperCase(),
    },
    update: {
      name: fallback.name,
      shortName:
        fallback.shortName ?? fallback.name.slice(0, 3).toUpperCase(),
    },
  });

  return created.id;
}

async function syncMatch(
  external: ExternalMatch,
  roundId: string
): Promise<{ created: boolean; updated: boolean; finished: boolean }> {
  const mapped = applyRemappedMatchState(external);
  const homeTeamId = await resolveTeamId(mapped.homeTeamApiId, {
    name: mapped.homeTeamName ?? "يُحدد لاحقاً",
    shortName: mapped.homeTeamShortName,
  });
  const awayTeamId = await resolveTeamId(mapped.awayTeamApiId, {
    name: mapped.awayTeamName ?? "يُحدد لاحقاً",
    shortName: mapped.awayTeamShortName,
  });

  if (!homeTeamId || !awayTeamId) {
    return { created: false, updated: false, finished: false };
  }

  let penaltyWinnerTeamId: string | null = null;
  if (mapped.penaltyWinnerTeamApiId) {
    penaltyWinnerTeamId = await resolveTeamId(
      mapped.penaltyWinnerTeamApiId
    );
  }

  const existing = await prisma.match.findUnique({
    where: { apiMatchId: mapped.apiId },
  });

  const wasFinished = existing?.status === "FINISHED";
  const isNowFinished = mapped.status === "FINISHED";

  const match = await prisma.match.upsert({
    where: { apiMatchId: mapped.apiId },
    create: {
      apiMatchId: mapped.apiId,
      roundId,
      homeTeamId,
      awayTeamId,
      matchTime: mapped.matchTime,
      groupCode: mapped.groupCode,
      stageName: mapped.stageName,
      status: mapped.status,
      isKnockout: mapped.isKnockout,
      homeScore: mapped.homeScore,
      awayScore: mapped.awayScore,
      actualFinishType: mapped.finishType,
      penaltyWinnerTeamId,
    },
    update: {
      matchTime: mapped.matchTime,
      groupCode: mapped.groupCode,
      stageName: mapped.stageName,
      status: mapped.status,
      isKnockout: mapped.isKnockout,
      homeScore: mapped.homeScore,
      awayScore: mapped.awayScore,
      actualFinishType: mapped.finishType,
      penaltyWinnerTeamId,
    },
  });

  const scoresChanged =
    existing &&
    (existing.homeScore !== mapped.homeScore ||
      existing.awayScore !== mapped.awayScore ||
      existing.status !== mapped.status);

  if (
    isNowFinished &&
    match.homeScore !== null &&
    match.awayScore !== null &&
    (!wasFinished || scoresChanged)
  ) {
    await calculateMatchPoints(match.id);
  }

  return {
    created: !existing,
    updated: !!existing,
    finished: isNowFinished && !wasFinished,
  };
}

export async function syncMatchesFromApi(
  roundId: string,
  options: SyncOptions = {}
) {
  const provider = getFootballApiProvider();

  const round = await prisma.round.findUnique({ where: { id: roundId } });
  if (!round) throw new Error("Round not found");

  const teams = await syncTeams(provider, options);
  const playersCount =
    process.env.SYNC_PLAYERS === "false"
      ? 0
      : await syncPlayers(provider, options);
  const externalMatches = await provider.fetchMatches(options);

  let created = 0;
  let updated = 0;
  let pointsCalculated = 0;

  for (const external of externalMatches) {
    const result = await syncMatch(external, roundId);
    if (result.created) created++;
    if (result.updated) updated++;
    if (result.finished) pointsCalculated++;
  }

  const knockoutAdvancement = await advanceKnockoutTeams(roundId);

  return {
    provider: provider.name,
    teamsSynced: teams.length,
    playersSynced: playersCount,
    matchesCreated: created,
    matchesUpdated: updated,
    pointsCalculated,
    totalMatches: externalMatches.length,
    knockoutAdvancement,
  };
}

export type { SyncOptions, ExternalMatch, FootballApiProvider };
