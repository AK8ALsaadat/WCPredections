import type { MatchPlayerView } from "@/services/match-players.service";

export type ScorerPicks = Record<string, number>;

export function buildPlayerTeamSets(lineup: {
  homePlayers: MatchPlayerView[];
  awayPlayers: MatchPlayerView[];
}) {
  return {
    home: new Set(lineup.homePlayers.map((p) => p.id)),
    away: new Set(lineup.awayPlayers.map((p) => p.id)),
  };
}

export function computeTeamGoalTotals(
  picks: ScorerPicks,
  homePlayerIds: Set<string>,
  awayPlayerIds: Set<string>
) {
  let homeTotal = 0;
  let awayTotal = 0;

  for (const [playerId, goals] of Object.entries(picks)) {
    if (homePlayerIds.has(playerId)) {
      homeTotal += goals;
    } else if (awayPlayerIds.has(playerId)) {
      awayTotal += goals;
    }
  }

  return { homeTotal, awayTotal };
}

export function getScorerBudgetStatus(
  picks: ScorerPicks,
  homePlayerIds: Set<string>,
  awayPlayerIds: Set<string>,
  predHome: number,
  predAway: number
) {
  const { homeTotal, awayTotal } = computeTeamGoalTotals(
    picks,
    homePlayerIds,
    awayPlayerIds
  );

  return {
    homeTotal,
    awayTotal,
    homeExceeded: homeTotal > predHome,
    awayExceeded: awayTotal > predAway,
    anyExceeded: homeTotal > predHome || awayTotal > predAway,
  };
}

export function picksToArray(picks: ScorerPicks) {
  return Object.entries(picks).map(([playerId, goals]) => ({
    playerId,
    goals,
  }));
}
