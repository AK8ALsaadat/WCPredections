import { revalidateTag } from "next/cache";
import { publish } from "@/lib/broadcaster";
import { normalizePlayerName } from "@/lib/player-matching";
import { prisma } from "@/lib/prisma";
import { fetchEspnLiveMatch } from "@/services/football-api/espn-live.provider";
import { replaceMatchScorers } from "@/services/match-scorers.service";
import { recalculateMatchScoring } from "@/services/prediction.service";

const LIVE_SYNC_TTL_MS = 8_000;
const lastSyncAt = new Map<string, number>();
const inFlight = new Map<string, Promise<{ synced: boolean }>>();
let lastGlobalSyncAt = 0;
let globalSyncInFlight: Promise<{ synced: number }> | null = null;

function slugifyTeamName(text: string) {
  return normalizePlayerName(text).replace(/\s+/g, "-");
}

async function syncLiveMatch(matchId: string) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      homeTeam: { select: { id: true, apiTeamId: true, name: true } },
      awayTeam: { select: { id: true, apiTeamId: true, name: true } },
      matchScorers: {
        include: { player: { select: { name: true, teamId: true } } },
      },
    },
  });
  if (!match) return { synced: false };

  const snapshot = await fetchEspnLiveMatch({
    matchTime: match.matchTime,
    homeTeamName: match.homeTeam.name,
    awayTeamName: match.awayTeam.name,
  });
  if (!snapshot) return { synced: false };

  const status =
    match.status === "FINISHED"
      ? "FINISHED"
      : match.status === "LIVE" && snapshot.status === "SCHEDULED"
        ? "LIVE"
        : snapshot.status;

  const sourceTeamIds = new Map([
    [slugifyTeamName(match.homeTeam.name), match.homeTeam.id],
    [slugifyTeamName(match.awayTeam.name), match.awayTeam.id],
  ]);
  const sourceScorers = snapshot.scorers
    .map((scorer) => {
      const teamId = scorer.teamApiId
        ? sourceTeamIds.get(scorer.teamApiId)
        : undefined;
      return teamId
        ? `${teamId}:${normalizePlayerName(scorer.playerName ?? "")}:${scorer.goals}`
        : "";
    })
    .filter(Boolean)
    .sort();
  const knownScorers = match.matchScorers
    .map(
      (scorer) =>
        `${scorer.player.teamId}:${normalizePlayerName(scorer.player.name)}:${scorer.goals}`
    )
    .sort();
  const scorersChanged =
    sourceScorers.length !== knownScorers.length ||
    sourceScorers.some((value, index) => value !== knownScorers[index]);
  const matchChanged =
    match.status !== status ||
    match.homeScore !== snapshot.homeScore ||
    match.awayScore !== snapshot.awayScore;

  if (!matchChanged && (!snapshot.scorersComplete || !scorersChanged)) {
    return { synced: true };
  }

  const updated = matchChanged
    ? await prisma.match.update({
        where: { id: match.id },
        data: {
          status,
          homeScore: snapshot.homeScore,
          awayScore: snapshot.awayScore,
        },
        include: {
          homeTeam: { select: { id: true, apiTeamId: true, name: true } },
          awayTeam: { select: { id: true, apiTeamId: true, name: true } },
        },
      })
    : match;

  let scoringUpdated = false;
  if (snapshot.scorersComplete) {
    if (scorersChanged) {
      await replaceMatchScorers(match.id, snapshot.scorers, updated);
    }
    if (status === "LIVE" || status === "FINISHED") {
      await recalculateMatchScoring(match.id);
      scoringUpdated = true;
    }
  }

  publish({
    type: scoringUpdated ? "match-scoring-updated" : "match-updated",
    data: {
      matchId: match.id,
      status,
      homeScore: snapshot.homeScore,
      awayScore: snapshot.awayScore,
    },
  });

  try {
    revalidateTag("matches-schedule");
    revalidateTag(`match-${match.id}`);
    if (scoringUpdated) {
      revalidateTag("leaderboard-overall");
      revalidateTag(`leaderboard-round-${match.roundId}`);
    }
  } catch {
    // Timers and direct scripts may not have a Next.js cache store.
  }

  return { synced: true };
}

export async function ensureLiveMatchScoringFresh(matchId: string) {
  const last = lastSyncAt.get(matchId) ?? 0;
  if (Date.now() - last < LIVE_SYNC_TTL_MS) return { synced: false };

  const current = inFlight.get(matchId);
  if (current) return current;

  lastSyncAt.set(matchId, Date.now());
  const promise = syncLiveMatch(matchId)
    .catch((error) => {
      console.warn(
        `[live scoring] skipped ${matchId}:`,
        error instanceof Error ? error.message : error
      );
      return { synced: false };
    })
    .finally(() => {
      inFlight.delete(matchId);
    });

  inFlight.set(matchId, promise);
  return promise;
}

async function syncLiveMatches() {
  const now = Date.now();
  const matches = await prisma.match.findMany({
    where: {
      status: { in: ["SCHEDULED", "LIVE"] },
      matchTime: {
        gte: new Date(now - 5 * 60 * 60 * 1000),
        lte: new Date(now + 30 * 60 * 1000),
      },
      OR: [
        { predictions: { some: {} } },
        { scorerPredictions: { some: {} } },
        { boldScorerBets: { some: {} } },
        { octopusBets: { some: {} } },
      ],
    },
    select: { id: true },
    take: 8,
  });

  await Promise.all(
    matches.map((match) => ensureLiveMatchScoringFresh(match.id))
  );
  return { synced: matches.length };
}

export function syncLiveMatchesFreshQuick() {
  if (Date.now() - lastGlobalSyncAt < LIVE_SYNC_TTL_MS) {
    return Promise.resolve({ synced: 0 });
  }
  if (globalSyncInFlight) return globalSyncInFlight;

  lastGlobalSyncAt = Date.now();
  globalSyncInFlight = syncLiveMatches()
    .catch((error) => {
      console.warn(
        "[live scoring] global sync skipped:",
        error instanceof Error ? error.message : error
      );
      return { synced: 0 };
    })
    .finally(() => {
      globalSyncInFlight = null;
    });

  return globalSyncInFlight;
}
