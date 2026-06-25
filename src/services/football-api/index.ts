import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { applyRemappedMatchState } from "@/lib/wc-dates";
import { advanceKnockoutTeams } from "@/services/knockout-advancement.service";
import { syncMatchScorersFromApi } from "@/services/match-scorers.service";
import { syncGoalkeeperSavesFromApi } from "@/services/octopus-bet.service";
import { recalculateMatchScoring } from "@/services/prediction.service";
import { publish } from '@/lib/broadcaster';
import { ApiFootballProvider } from "./api-football.provider";
import { FootballDataProvider } from "./football-data.provider";
import { SportScoreProvider } from "./sportscore.provider";
import type { ExternalMatch, FootballApiProvider, SyncOptions } from "./types";
import { resolveFootballApiProviderName } from "./types";
import {
  matchIdentityKey,
  normalizeTeamIdentity,
} from "@/lib/team-identity";

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
          position: player.position || null,
          shirtNumber: player.shirtNumber ?? null,
        },
        update: { 
          name: player.name,
          position: player.position || null,
          ...(player.shirtNumber != null
            ? { shirtNumber: player.shirtNumber }
            : {}),
        },
      });
      count++;
    }
  }

  return count;
}

async function resolveTeamId(
  apiTeamId: string,
  fallback?: { name: string; shortName?: string; logoUrl?: string }
): Promise<string | null> {
  const team = await prisma.team.findUnique({
    where: { apiTeamId },
  });
  if (team) {
    if (
      fallback?.logoUrl &&
      fallback.logoUrl !== team.logoUrl
    ) {
      await prisma.team.update({
        where: { id: team.id },
        data: { logoUrl: fallback.logoUrl },
      });
    }
    return team.id;
  }

  if (fallback?.name) {
    const exactName = await prisma.team.findFirst({
      where: { name: { equals: fallback.name } },
    });
    const targetIdentity = normalizeTeamIdentity(fallback.name);
    const candidates =
      exactName || !targetIdentity ? [] : await prisma.team.findMany();
    const byName =
      exactName ??
      candidates.find(
        (candidate) =>
          normalizeTeamIdentity(candidate.name) === targetIdentity
      );
    if (byName) {
      await prisma.team.update({
        where: { id: byName.id },
        data: {
          apiTeamId,
          logoUrl: fallback.logoUrl ?? byName.logoUrl,
        },
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
      logoUrl: fallback.logoUrl,
    },
    update: {
      name: fallback.name,
      shortName:
        fallback.shortName ?? fallback.name.slice(0, 3).toUpperCase(),
      logoUrl: fallback.logoUrl ?? undefined,
    },
  });

  return created.id;
}

async function findExistingMatch(
  roundId: string,
  mapped: ExternalMatch,
  homeTeamId: string,
  awayTeamId: string
) {
  const matchTime = mapped.matchTime;
  const timeWindow = {
    gte: new Date(matchTime.getTime() - 30 * 60 * 1000),
    lte: new Date(matchTime.getTime() + 30 * 60 * 1000),
  };

  let existing = await prisma.match.findUnique({
    where: { apiMatchId: mapped.apiId },
  });
  if (existing) return existing;

  existing = await prisma.match.findFirst({
    where: { roundId, homeTeamId, awayTeamId, matchTime: timeWindow },
  });
  if (existing) return existing;

  if (mapped.homeTeamName && mapped.awayTeamName) {
    existing = await prisma.match.findFirst({
      where: {
        roundId,
        matchTime: timeWindow,
        homeTeam: {
          name: { equals: mapped.homeTeamName },
        },
        awayTeam: {
          name: { equals: mapped.awayTeamName },
        },
      },
    });
  }

  return existing;
}

async function mergeMatchIntoCanonical(canonicalId: string, duplicateId: string) {
  if (canonicalId === duplicateId) return;

  const dupPreds = await prisma.prediction.findMany({
    where: { matchId: duplicateId },
  });
  for (const p of dupPreds) {
    const conflict = await prisma.prediction.findUnique({
      where: {
        userId_matchId: { userId: p.userId, matchId: canonicalId },
      },
    });
    if (conflict) {
      await prisma.prediction.delete({ where: { id: p.id } });
    } else {
      await prisma.prediction.update({
        where: { id: p.id },
        data: { matchId: canonicalId },
      });
    }
  }

  const dupScorers = await prisma.scorerPrediction.findMany({
    where: { matchId: duplicateId },
  });
  for (const s of dupScorers) {
    const conflict = await prisma.scorerPrediction.findUnique({
      where: {
        userId_matchId_playerId: {
          userId: s.userId,
          matchId: canonicalId,
          playerId: s.playerId,
        },
      },
    });
    if (conflict) {
      await prisma.scorerPrediction.delete({ where: { id: s.id } });
    } else {
      await prisma.scorerPrediction.update({
        where: { id: s.id },
        data: { matchId: canonicalId },
      });
    }
  }

  const dupBoldBets = await prisma.boldScorerBet.findMany({
    where: { matchId: duplicateId },
  });
  for (const bet of dupBoldBets) {
    const conflict = await prisma.boldScorerBet.findUnique({
      where: {
        userId_usageRoundKey: {
          userId: bet.userId,
          usageRoundKey: bet.usageRoundKey,
        },
      },
    });
    if (conflict && conflict.matchId !== duplicateId) {
      await prisma.boldScorerBet.delete({ where: { id: bet.id } });
    } else {
      await prisma.boldScorerBet.update({
        where: { id: bet.id },
        data: { matchId: canonicalId },
      });
    }
  }

  const dupOctopusBets = await prisma.octopusGoalkeeperBet.findMany({
    where: { matchId: duplicateId },
  });
  for (const bet of dupOctopusBets) {
    const conflict = await prisma.octopusGoalkeeperBet.findUnique({
      where: {
        userId_usageRoundKey: {
          userId: bet.userId,
          usageRoundKey: bet.usageRoundKey,
        },
      },
    });
    if (conflict && conflict.matchId !== duplicateId) {
      await prisma.octopusGoalkeeperBet.delete({ where: { id: bet.id } });
    } else {
      await prisma.octopusGoalkeeperBet.update({
        where: { id: bet.id },
        data: { matchId: canonicalId },
      });
    }
  }

  const dupMatchScorers = await prisma.matchScorer.findMany({
    where: { matchId: duplicateId },
  });
  for (const ms of dupMatchScorers) {
    const conflict = await prisma.matchScorer.findUnique({
      where: {
        matchId_playerId: { matchId: canonicalId, playerId: ms.playerId },
      },
    });
    if (conflict) {
      await prisma.matchScorer.delete({ where: { id: ms.id } });
    } else {
      await prisma.matchScorer.update({
        where: { id: ms.id },
        data: { matchId: canonicalId },
      });
    }
  }

  const dupGoalkeeperStats = await prisma.matchGoalkeeperStat.findMany({
    where: { matchId: duplicateId },
  });
  for (const stat of dupGoalkeeperStats) {
    const conflict = await prisma.matchGoalkeeperStat.findUnique({
      where: {
        matchId_playerId: { matchId: canonicalId, playerId: stat.playerId },
      },
    });
    if (conflict) {
      await prisma.matchGoalkeeperStat.update({
        where: { id: conflict.id },
        data: {
          saves: Math.max(conflict.saves, stat.saves),
          source: stat.source,
        },
      });
      await prisma.matchGoalkeeperStat.delete({ where: { id: stat.id } });
    } else {
      await prisma.matchGoalkeeperStat.update({
        where: { id: stat.id },
        data: { matchId: canonicalId },
      });
    }
  }

  await prisma.match.delete({ where: { id: duplicateId } });
}

export async function reconcileDuplicateMatchesInRound(roundId: string) {
  const matches = await prisma.match.findMany({
    where: { roundId },
    include: {
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
      _count: {
        select: {
          predictions: true,
          scorerPredictions: true,
          fanClashPicks: true,
        },
      },
    },
  });

  const byPair = new Map<string, typeof matches>();
  for (const m of matches) {
    const key = `${matchIdentityKey(
      m.homeTeam.name,
      m.awayTeam.name
    )}|${m.matchTime.getTime()}`;
    const list = byPair.get(key) ?? [];
    list.push(m);
    byPair.set(key, list);
  }

  let merged = 0;
  for (const group of byPair.values()) {
    if (group.length < 2) continue;

    const rank = (m: (typeof group)[0]) => {
      if (m.status === "LIVE") return 1_000;
      if (m.status === "FINISHED") return 900;
      return m._count.predictions + m._count.scorerPredictions;
    };

    group.sort(
      (a, b) =>
        rank(b) - rank(a) || b.updatedAt.getTime() - a.updatedAt.getTime()
    );

    const canonical = group[0];
    for (const dup of group.slice(1)) {
      if (dup._count.fanClashPicks > 0) continue;
      await mergeMatchIntoCanonical(canonical.id, dup.id);
      merged++;
    }

    if (
      canonical.status === "LIVE" ||
      canonical.status === "FINISHED"
    ) {
      try {
        await recalculateMatchScoring(canonical.id);
      } catch {
        // غير جاهزة للاحتساب بعد
      }
    }
  }

  return { merged };
}

async function syncMatch(
  external: ExternalMatch,
  roundId: string,
  options: SyncOptions = {},
  sourceProvider?: FootballApiProvider
): Promise<{ created: boolean; updated: boolean; finished: boolean }> {
  const mapped = applyRemappedMatchState(external);
  const homeTeamId = await resolveTeamId(mapped.homeTeamApiId, {
    name: mapped.homeTeamName ?? "يُحدد لاحقاً",
    shortName: mapped.homeTeamShortName,
    logoUrl: mapped.homeTeamLogoUrl,
  });
  const awayTeamId = await resolveTeamId(mapped.awayTeamApiId, {
    name: mapped.awayTeamName ?? "يُحدد لاحقاً",
    shortName: mapped.awayTeamShortName,
    logoUrl: mapped.awayTeamLogoUrl,
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

  const existing = await findExistingMatch(
    roundId,
    mapped,
    homeTeamId,
    awayTeamId
  );

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
  let scorerDataComplete = !shouldSyncScorers;

  if (shouldSyncScorers) {
    try {
      await syncMatchScorersFromApi(
        match.id,
        mapped.apiId,
        options,
        sourceProvider
      );
      await syncGoalkeeperSavesFromApi(
        match.id,
        mapped.apiId,
        options,
        sourceProvider
      );
      scorerDataComplete = true;
      // Publish immediate update about match scorers and basic match info
      try {
        const ms = await prisma.matchScorer.findMany({ where: { matchId: match.id }, include: { player: true } });
        publish({ type: 'match-scorers-updated', data: { matchId: match.id, matchScorers: ms } });
        publish({ type: 'match-updated', data: { matchId: match.id, status: match.status, homeScore: match.homeScore, awayScore: match.awayScore } });
      } catch {}
    } catch (error) {
      const knownScorers = await prisma.matchScorer.findMany({
        where: { matchId: match.id },
        select: { goals: true },
      });
      const knownGoals = knownScorers.reduce((sum, row) => sum + row.goals, 0);
      scorerDataComplete =
        knownGoals === (match.homeScore ?? 0) + (match.awayScore ?? 0);
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
      // Broadcast match scoring update to connected clients (real-time UI)
      try {
        publish({ type: 'match-scoring-updated', data: { matchId: match.id } });
      } catch {}
    } catch (error) {
      console.warn(
        `[مزامنة نقاط] تخطي مباراة ${match.id}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  if (mapped.status === "LIVE" || mapped.status === "FINISHED") {
    try {
      revalidateTag("matches-schedule");
      revalidateTag(`match-${match.id}`);
    } catch {
      // Direct sync scripts do not have a Next.js request cache store.
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
  const externals = new Map<string, ExternalMatch>();
  const now = Date.now();

  const push = (match: ExternalMatch) => {
    if (match.status === "LIVE" || match.status === "FINISHED") {
      externals.set(match.apiId, match);
    }
  };

  for (const match of await provider.fetchMatchesQuick()) {
    push(match);
  }

  const candidates = await prisma.match.findMany({
    where: {
      roundId,
      predictions: { some: {} },
      status: { in: ["SCHEDULED", "LIVE", "FINISHED"] },
    },
    include: {
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });

  const nearest = candidates
    .sort(
      (a, b) =>
        Math.abs(a.matchTime.getTime() - now) -
        Math.abs(b.matchTime.getTime() - now)
    )
    .slice(0, 16);

  const slugJobs: string[] = [];
  for (const row of nearest) {
    const built = await provider.buildSlugFromTeams(
      row.homeTeam.name,
      row.awayTeam.name
    );
    if (row.apiMatchId?.includes("-vs-")) {
      slugJobs.push(row.apiMatchId);
    }
    slugJobs.push(built);
  }

  const uniqueSlugs = [...new Set(slugJobs)].filter(
    (slug) => !externals.has(slug)
  );

  for (let i = 0; i < uniqueSlugs.length; i += 4) {
    const batch = uniqueSlugs.slice(i, i + 4);
    const results = await Promise.all(
      batch.map(async (slug) => {
        try {
          return await provider.fetchMatchBySlug(slug);
        } catch {
          return null;
        }
      })
    );
    for (const external of results) {
      if (external) push(external);
    }
  }

  return Array.from(externals.values());
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
  const sourceByApiId = new Map<string, FootballApiProvider>(
    externalMatches.map((match) => [match.apiId, provider])
  );

  if (provider.name === "sportscore") {
    const dbUpdates = await fetchSportScoreUpdatesForRound(
      provider as SportScoreProvider,
      roundId
    );
    const merged = new Map(externalMatches.map((m) => [m.apiId, m]));
    for (const match of dbUpdates) {
      merged.set(match.apiId, match);
      sourceByApiId.set(match.apiId, provider);
    }

    // SportScore can occasionally omit a live fixture. Football-Data is the
    // status/scorer fallback so live scoring does not stall for that match.
    if (process.env.FOOTBALL_DATA_API_KEY) {
      try {
        const fallbackProvider = new FootballDataProvider();
        const fallbackMatches = await fallbackProvider.fetchMatches({
          leagueId: process.env.FOOTBALL_LEAGUE_ID ?? "WC",
          season: process.env.FOOTBALL_SEASON ?? "2026",
        });
        for (const match of fallbackMatches) {
          if (match.status !== "LIVE") continue;
          merged.set(match.apiId, match);
          sourceByApiId.set(match.apiId, fallbackProvider);
        }
      } catch (error) {
        console.warn(
          "[live fallback] Football-Data unavailable:",
          error instanceof Error ? error.message : error
        );
      }
    }
    externalMatches = Array.from(merged.values());
  }

  let created = 0;
  let updated = 0;
  let pointsCalculated = 0;

  for (const external of externalMatches) {
    const result = await syncMatch(
      external,
      roundId,
      options,
      sourceByApiId.get(external.apiId) ?? provider
    );
    if (result.created) created++;
    if (result.updated) updated++;
    if (result.finished) pointsCalculated++;
  }

  const knockoutAdvancement = isSportScoreQuick
    ? {
        groupStageComplete: false,
        qualifiedThirdGroups: [] as string[],
        annexMatched: false,
        knockoutMatchesUpdated: 0,
      }
    : await advanceKnockoutTeams(roundId);

  await reconcileDuplicateMatchesInRound(roundId);

  if (updated > 0 || created > 0) {
    try {
      revalidateTag("matches-schedule");
    } catch {
      // Direct sync scripts do not have a Next.js request cache store.
    }
  }

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

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeoutMs)),
  ]);
}

export async function ensureMatchSyncedFromApi(matchId: string) {
  const provider = getFootballApiProvider();
  if (provider.name !== "sportscore") return { synced: false };

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });
  if (!match) return { synced: false };

  const ss = provider as SportScoreProvider;
  const slug = match.apiMatchId?.includes("-vs-")
    ? match.apiMatchId
    : await ss.buildSlugFromTeams(match.homeTeam.name, match.awayTeam.name);

  try {
    const external = await ss.fetchMatchBySlug(slug);
    if (!external) return { synced: false };

    await syncMatch(external, match.roundId, { quickSync: true }, provider);
    await reconcileDuplicateMatchesInRound(match.roundId);
    return { synced: true };
  } catch (error) {
    console.warn(
      `[مزامنة مباراة] تخطي ${matchId}:`,
      error instanceof Error ? error.message : error
    );
    return { synced: false };
  }
}

export async function syncStalePredictedMatches(
  roundId?: string,
  options?: { maxMatches?: number }
) {
  const provider = getFootballApiProvider();
  if (provider.name !== "sportscore") return { synced: 0 };

  let targetRoundId = roundId;
  if (!targetRoundId) {
    const round = await prisma.round.findFirst({
      orderBy: { startsAt: "desc" },
      select: { id: true },
    });
    targetRoundId = round?.id;
  }
  if (!targetRoundId) return { synced: 0 };

  const now = new Date();
  const stale = await prisma.match.findMany({
    where: {
      roundId: targetRoundId,
      predictions: { some: {} },
      OR: [
        { status: "LIVE" },
        { status: "FINISHED" },
        { status: "SCHEDULED", matchTime: { lte: now } },
      ],
    },
    include: {
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
    take: options?.maxMatches ?? 12,
  });

  let synced = 0;
  for (const row of stale) {
    const result = await ensureMatchSyncedFromApi(row.id);
    if (result.synced) synced++;
  }

  if (synced > 0) {
    await reconcileDuplicateMatchesInRound(targetRoundId);
    try {
      revalidateTag("matches-schedule");
    } catch {
      // Direct sync scripts do not have a Next.js request cache store.
    }
  }

  return { synced };
}

export async function ensureMatchSyncedFromApiQuick(matchId: string) {
  return withTimeout(ensureMatchSyncedFromApi(matchId), 8_000, { synced: false });
}

export async function syncStalePredictedMatchesQuick(
  roundId?: string,
  options?: { maxMatches?: number }
) {
  return withTimeout(
    syncStalePredictedMatches(roundId, options),
    10_000,
    { synced: 0 }
  );
}

export type { SyncOptions, ExternalMatch, FootballApiProvider };
