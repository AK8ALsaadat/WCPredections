import { addHours, subHours } from "date-fns";
import { prisma } from "@/lib/prisma";
import { applyRemappedMatchState } from "@/lib/wc-dates";
import { advanceKnockoutTeams } from "@/services/knockout-advancement.service";
import { syncMatchScorersFromApi } from "@/services/match-scorers.service";
import { recalculateMatchScoring } from "@/services/prediction.service";
import { ApiFootballProvider } from "./api-football.provider";
import { FootballDataProvider } from "./football-data.provider";
import { SportScoreProvider } from "./sportscore.provider";
import type { ExternalMatch, FootballApiProvider, SyncOptions } from "./types";
import { resolveFootballApiProviderName } from "./types";

export function getFootballApiProvider(): FootballApiProvider {
  const provider = resolveFootballApiProviderName();

  switch (provider) {
    case "football-data":
      return new FootballDataProvider();
    case "sportscore":
      return new SportScoreProvider();
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

  if (fallback?.name) {
    const byName = await prisma.team.findFirst({
      where: {
        name: { equals: fallback.name, mode: "insensitive" },
      },
    });
    if (byName) {
      await prisma.team.update({
        where: { id: byName.id },
        data: { apiTeamId },
      });
      return byName.id;
    }
  }

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
  roundId: string,
  options: SyncOptions = {}
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

  let existing = await prisma.match.findUnique({
    where: { apiMatchId: mapped.apiId },
  });

  if (!existing) {
    existing = await prisma.match.findFirst({
      where: { roundId, homeTeamId, awayTeamId },
    });
  }

  const wasFinished = existing?.status === "FINISHED";
  const isNowFinished = mapped.status === "FINISHED";

  const matchData = {
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
  };

  const match = existing
    ? await prisma.match.update({
        where: { id: existing.id },
        data: matchData,
      })
    : await prisma.match.create({ data: matchData });

  const scoresChanged =
    existing &&
    (existing.homeScore !== mapped.homeScore ||
      existing.awayScore !== mapped.awayScore ||
      existing.status !== mapped.status);

  const shouldSyncScorers =
    mapped.status === "LIVE" || mapped.status === "FINISHED";

  if (shouldSyncScorers) {
    try {
      await syncMatchScorersFromApi(match.id, mapped.apiId, options);
    } catch (error) {
      console.warn(
        `[مزامنة هدافين] تخطي مباراة ${mapped.apiId}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  const canRecalculate =
    match.homeScore !== null &&
    match.awayScore !== null &&
    (mapped.status === "LIVE" || isNowFinished);

  if (canRecalculate && shouldSyncScorers) {
    try {
      await recalculateMatchScoring(match.id);
    } catch (error) {
      console.warn(
        `[مزامنة نقاط] تخطي مباراة ${match.id}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  return {
    created: !existing,
    updated: !!existing,
    finished: isNowFinished && !wasFinished,
  };
}

async function fetchSportScoreUpdatesForRound(
  provider: SportScoreProvider,
  roundId: string
): Promise<ExternalMatch[]> {
  const now = new Date();
  const dbMatches = await prisma.match.findMany({
    where: {
      roundId,
      matchTime: {
        gte: subHours(now, 6),
        lte: addHours(now, 3),
      },
    },
    include: {
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });

  const externals: ExternalMatch[] = [];
  const seen = new Set<string>();

  for (const row of dbMatches) {
    const slugCandidates = [
      row.apiMatchId,
      await provider.buildSlugFromTeams(
        row.homeTeam.name,
        row.awayTeam.name
      ),
    ].filter((slug): slug is string => Boolean(slug));

    for (const slug of slugCandidates) {
      if (seen.has(slug)) continue;

      try {
        const external = await provider.fetchMatchBySlug(slug);
        if (external) {
          seen.add(external.apiId);
          externals.push(external);
          break;
        }
      } catch {
        // جرّب الـ slug التالي
      }
    }
  }

  return externals;
}

export async function syncMatchesFromApi(
  roundId: string,
  options: SyncOptions = {}
) {
  const provider = getFootballApiProvider();

  const round = await prisma.round.findUnique({ where: { id: roundId } });
  if (!round) throw new Error("Round not found");

  const isSportScoreQuick =
    provider.name === "sportscore" && options.quickSync === true;

  const teams = isSportScoreQuick
    ? []
    : await syncTeams(provider, options);
  const skipPlayers =
    process.env.SYNC_PLAYERS === "false" || provider.name === "sportscore";
  const playersCount = skipPlayers ? 0 : await syncPlayers(provider, options);

  let externalMatches = await provider.fetchMatches(options);

  if (provider.name === "sportscore") {
    const dbUpdates = await fetchSportScoreUpdatesForRound(
      provider as SportScoreProvider,
      roundId
    );
    const merged = new Map(externalMatches.map((m) => [m.apiId, m]));
    for (const match of dbUpdates) {
      merged.set(match.apiId, match);
    }
    externalMatches = Array.from(merged.values());
  }

  let created = 0;
  let updated = 0;
  let pointsCalculated = 0;

  for (const external of externalMatches) {
    const result = await syncMatch(external, roundId, options);
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
