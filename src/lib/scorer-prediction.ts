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

export function countTeamScorers(
  picks: ScorerPicks,
  homePlayerIds: Set<string>,
  awayPlayerIds: Set<string>
) {
  let homeCount = 0;
  let awayCount = 0;

  for (const playerId of Object.keys(picks)) {
    if (homePlayerIds.has(playerId)) {
      homeCount++;
    } else if (awayPlayerIds.has(playerId)) {
      awayCount++;
    }
  }

  return { homeCount, awayCount };
}

export function canAddScorer(
  picks: ScorerPicks,
  playerId: string,
  homePlayerIds: Set<string>,
  awayPlayerIds: Set<string>,
  predHome: number,
  predAway: number
) {
  if (playerId in picks) return true;

  const isHome = homePlayerIds.has(playerId);
  const isAway = awayPlayerIds.has(playerId);
  if (!isHome && !isAway) return false;

  const pred = isHome ? predHome : predAway;
  if (pred <= 0) return false;

  const { homeCount, awayCount } = countTeamScorers(
    picks,
    homePlayerIds,
    awayPlayerIds
  );
  const teamCount = isHome ? homeCount : awayCount;
  if (teamCount >= pred) return false;

  const { homeTotal, awayTotal } = computeTeamGoalTotals(
    picks,
    homePlayerIds,
    awayPlayerIds
  );
  const teamTotal = isHome ? homeTotal : awayTotal;
  return teamTotal + 1 <= pred;
}

export function maxGoalsForPlayer(
  picks: ScorerPicks,
  playerId: string,
  homePlayerIds: Set<string>,
  awayPlayerIds: Set<string>,
  predHome: number,
  predAway: number
) {
  const isHome = homePlayerIds.has(playerId);
  const pred = isHome ? predHome : predAway;
  const { homeTotal, awayTotal } = computeTeamGoalTotals(
    picks,
    homePlayerIds,
    awayPlayerIds
  );
  const teamTotal = isHome ? homeTotal : awayTotal;
  const current = picks[playerId] ?? 1;
  return Math.max(1, pred - (teamTotal - current));
}

function trimTeamPicks(
  picks: ScorerPicks,
  teamPlayerIds: Set<string>,
  predGoals: number
): ScorerPicks {
  const next = { ...picks };
  const teamIds = Object.keys(next).filter((id) => teamPlayerIds.has(id));

  for (const id of teamIds) {
    if (predGoals <= 0) delete next[id];
  }

  let ids = Object.keys(next).filter((id) => teamPlayerIds.has(id));
  while (ids.length > predGoals) {
    const removeId = ids.pop()!;
    delete next[removeId];
  }

  ids = Object.keys(next).filter((id) => teamPlayerIds.has(id));
  let total = ids.reduce((sum, id) => sum + (next[id] ?? 1), 0);
  while (total > predGoals && ids.length > 0) {
    const lastId = ids[ids.length - 1];
    if ((next[lastId] ?? 1) > 1) {
      next[lastId]--;
      total--;
    } else {
      delete next[lastId];
      ids.pop();
      total = ids.reduce((sum, id) => sum + (next[id] ?? 1), 0);
    }
  }

  return next;
}

export function pruneScorerPicksToBudget(
  picks: ScorerPicks,
  homePlayerIds: Set<string>,
  awayPlayerIds: Set<string>,
  predHome: number,
  predAway: number
): ScorerPicks {
  let next = trimTeamPicks(picks, homePlayerIds, predHome);
  next = trimTeamPicks(next, awayPlayerIds, predAway);
  return next;
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
  const { homeCount, awayCount } = countTeamScorers(
    picks,
    homePlayerIds,
    awayPlayerIds
  );

  const homeGoalsExceeded = homeTotal > predHome;
  const awayGoalsExceeded = awayTotal > predAway;
  const homeScorersExceeded = homeCount > predHome;
  const awayScorersExceeded = awayCount > predAway;

  return {
    homeTotal,
    awayTotal,
    homeCount,
    awayCount,
    homeExceeded: homeGoalsExceeded || homeScorersExceeded,
    awayExceeded: awayGoalsExceeded || awayScorersExceeded,
    homeGoalsExceeded,
    awayGoalsExceeded,
    homeScorersExceeded,
    awayScorersExceeded,
    anyExceeded:
      homeGoalsExceeded ||
      awayGoalsExceeded ||
      homeScorersExceeded ||
      awayScorersExceeded,
  };
}

export function picksToArray(picks: ScorerPicks) {
  return Object.entries(picks).map(([playerId, goals]) => ({
    playerId,
    goals,
  }));
}
