import { resolvePlayerInSquad } from "@/lib/player-matching";
import { prisma } from "@/lib/prisma";
import { fetchEspnLiveMatch } from "@/services/football-api/espn-live.provider";
import { getFootballApiProvider } from "@/services/football-api";
import type {
  ExternalMatchScorer,
  FootballApiProvider,
  SyncOptions,
} from "@/services/football-api/types";

type MatchForScorers = {
  homeScore: number | null;
  awayScore: number | null;
  matchTime: Date;
  homeTeam: { id: string; apiTeamId: string | null; name: string };
  awayTeam: { id: string; apiTeamId: string | null; name: string };
};

const matchForScorersSelect = {
  homeScore: true,
  awayScore: true,
  matchTime: true,
  homeTeam: { select: { id: true, apiTeamId: true, name: true } },
  awayTeam: { select: { id: true, apiTeamId: true, name: true } },
} as const;

function slugifyTeamName(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function resolveScorerTeamId(
  match: MatchForScorers,
  teamApiId: string
) {
  if (
    match.homeTeam.apiTeamId === teamApiId ||
    slugifyTeamName(match.homeTeam.name) === teamApiId
  ) {
    return match.homeTeam.id;
  }
  if (
    match.awayTeam.apiTeamId === teamApiId ||
    slugifyTeamName(match.awayTeam.name) === teamApiId
  ) {
    return match.awayTeam.id;
  }

  const team = await prisma.team.findFirst({
    where: { apiTeamId: teamApiId },
    select: { id: true },
  });
  return team?.id ?? null;
}

export async function replaceMatchScorers(
  matchId: string,
  apiScorers: ExternalMatchScorer[],
  loadedMatch?: MatchForScorers
) {
  const match =
    loadedMatch ??
    (await prisma.match.findUnique({
      where: { id: matchId },
      select: matchForScorersSelect,
    }));
  if (!match) throw new Error("Match not found");

  const resolved = new Map<
    string,
    { playerId: string; goals: number; minute: number | null }
  >();

  for (const {
    playerApiId,
    goals,
    playerName,
    teamApiId,
    minute,
  } of apiScorers) {
    if (goals <= 0) continue;

    let player = await prisma.player.findFirst({
      where: { apiPlayerId: playerApiId },
      select: { id: true },
    });

    if (!player && playerName && teamApiId) {
      const teamId = await resolveScorerTeamId(match, teamApiId);
      if (teamId) {
        const squad = await prisma.player.findMany({
          where: { teamId },
          select: { id: true, name: true, apiPlayerId: true },
        });
        const matched = resolvePlayerInSquad(squad, {
          apiPlayerId: playerApiId,
          playerName,
        });

        if (matched) {
          player = matched;
        } else {
          player = await prisma.player.upsert({
            where: {
              teamId_apiPlayerId: {
                teamId,
                apiPlayerId: playerApiId,
              },
            },
            create: {
              teamId,
              name: playerName,
              apiPlayerId: playerApiId,
            },
            update: { name: playerName },
            select: { id: true },
          });
        }
      }
    }

    if (player) {
      const existing = resolved.get(player.id);
      resolved.set(player.id, {
        playerId: player.id,
        goals: (existing?.goals ?? 0) + goals,
        minute: existing?.minute ?? minute ?? null,
      });
    }
  }

  const expectedGoals = (match.homeScore ?? 0) + (match.awayScore ?? 0);
  const resolvedGoals = Array.from(resolved.values()).reduce(
    (sum, row) => sum + row.goals,
    0
  );

  // Never replace a complete scorer list with a partial provider response.
  if (expectedGoals > 0 && resolvedGoals !== expectedGoals) {
    throw new Error(
      `Provider scorer data is incomplete (${resolvedGoals}/${expectedGoals})`
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.matchScorer.deleteMany({ where: { matchId } });
    if (resolved.size > 0) {
      const data = Array.from(resolved.values()).map((row) => ({
        matchId,
        playerId: row.playerId,
        goals: row.goals,
        minute: row.minute,
      }));
      // ensure there are no duplicate player entries and skip duplicates at DB level
      const uniqueData = Array.from(
        new Map(data.map((d) => [d.playerId, d])).values()
      );
      await tx.matchScorer.createMany({
        data: uniqueData,
        skipDuplicates: true,
      });
    }
  });

  return resolved.size;
}

export async function syncMatchScorersFromApi(
  matchId: string,
  fixtureApiId: string,
  options: SyncOptions = {},
  sourceProvider?: FootballApiProvider
) {
  const provider = sourceProvider ?? getFootballApiProvider();
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: matchForScorersSelect,
  });
  if (!match) throw new Error("Match not found");

  let apiScorers: ExternalMatchScorer[] = [];
  let providerError: unknown = null;
  try {
    apiScorers = await provider.fetchMatchScorers(fixtureApiId, options);
  } catch (error) {
    providerError = error;
  }

  const expectedGoals = (match.homeScore ?? 0) + (match.awayScore ?? 0);
  const providerGoals = apiScorers.reduce((sum, row) => sum + row.goals, 0);

  if (expectedGoals > 0 && providerGoals !== expectedGoals) {
    const espn = await fetchEspnLiveMatch({
      matchTime: match.matchTime,
      homeTeamName: match.homeTeam.name,
      awayTeamName: match.awayTeam.name,
    });
    if (espn?.scorersComplete) {
      apiScorers = espn.scorers;
    }
  }

  if (apiScorers.length === 0 && providerError) throw providerError;
  return replaceMatchScorers(matchId, apiScorers, match);
}
