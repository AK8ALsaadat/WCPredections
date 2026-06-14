import type { MatchPlayerView } from "@/services/match-players.service";

export type ScorerPicks = Record<string, number>;

/** أقصى عدد لاعبين يقدر اليوزر يختارهم من منتخب واحد كهدافين */
export const MAX_SCORERS_PER_TEAM = 3;

/** أقصى عدد لاعبين إجمالي (المنتخبين معاً) يقدر اليوزر يختارهم كهدافين */
export const MAX_SCORERS_TOTAL = 5;

/** أقصى مجموع أهداف يمكن توزيعه على هدافي منتخب واحد */
export const MAX_PREDICTED_SCORER_GOALS_PER_TEAM = 5;

export function scorerGoalTarget(predictedGoals: number) {
  return Math.min(
    Math.max(0, predictedGoals),
    MAX_PREDICTED_SCORER_GOALS_PER_TEAM
  );
}

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

  const target = scorerGoalTarget(isHome ? predHome : predAway);
  if (target <= 0) return false;

  const { homeCount, awayCount } = countTeamScorers(
    picks,
    homePlayerIds,
    awayPlayerIds
  );
  const teamCount = isHome ? homeCount : awayCount;
  if (teamCount >= target) return false;

  if (teamCount >= MAX_SCORERS_PER_TEAM) return false;
  if (homeCount + awayCount >= MAX_SCORERS_TOTAL) return false;

  const { homeTotal, awayTotal } = computeTeamGoalTotals(
    picks,
    homePlayerIds,
    awayPlayerIds
  );
  const teamTotal = isHome ? homeTotal : awayTotal;
  return teamTotal + 1 <= target;
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
  const target = scorerGoalTarget(isHome ? predHome : predAway);
  const { homeTotal, awayTotal } = computeTeamGoalTotals(
    picks,
    homePlayerIds,
    awayPlayerIds
  );
  const teamTotal = isHome ? homeTotal : awayTotal;
  const current = picks[playerId] ?? 1;
  return Math.max(1, target - (teamTotal - current));
}

function trimTeamPicks(
  picks: ScorerPicks,
  teamPlayerIds: Set<string>,
  predGoals: number
): ScorerPicks {
  const next = { ...picks };
  const target = scorerGoalTarget(predGoals);
  const teamIds = Object.keys(next).filter((id) => teamPlayerIds.has(id));

  for (const id of teamIds) {
    if (target <= 0) delete next[id];
  }

  let ids = Object.keys(next).filter((id) => teamPlayerIds.has(id));
  while (ids.length > target) {
    const removeId = ids.pop()!;
    delete next[removeId];
  }

  ids = Object.keys(next).filter((id) => teamPlayerIds.has(id));
  let total = ids.reduce((sum, id) => sum + (next[id] ?? 1), 0);
  while (total > target && ids.length > 0) {
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

function trimToScorerLimits(
  picks: ScorerPicks,
  homePlayerIds: Set<string>,
  awayPlayerIds: Set<string>
): ScorerPicks {
  const next = { ...picks };
  const validPlayerIds = new Set([...homePlayerIds, ...awayPlayerIds]);

  for (const id of Object.keys(next)) {
    if (!validPlayerIds.has(id)) delete next[id];
  }

  for (const teamPlayerIds of [homePlayerIds, awayPlayerIds]) {
    const ids = Object.keys(next).filter((id) => teamPlayerIds.has(id));
    while (ids.length > MAX_SCORERS_PER_TEAM) {
      delete next[ids.pop()!];
    }
  }

  const allIds = Object.keys(next).filter(
    (id) => homePlayerIds.has(id) || awayPlayerIds.has(id)
  );
  while (allIds.length > MAX_SCORERS_TOTAL) {
    delete next[allIds.pop()!];
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
  next = trimToScorerLimits(next, homePlayerIds, awayPlayerIds);
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

  const homeTarget = scorerGoalTarget(predHome);
  const awayTarget = scorerGoalTarget(predAway);
  const homeGoalsExceeded = homeTotal > homeTarget;
  const awayGoalsExceeded = awayTotal > awayTarget;
  const homeScorersExceeded = homeCount > homeTarget;
  const awayScorersExceeded = awayCount > awayTarget;

  const homeIncomplete = homeTarget > 0 && homeTotal < homeTarget;
  const awayIncomplete = awayTarget > 0 && awayTotal < awayTarget;
  const homeComplete =
    homeTarget === 0
      ? homeTotal === 0 && homeCount === 0
      : homeTotal === homeTarget;
  const awayComplete =
    awayTarget === 0
      ? awayTotal === 0 && awayCount === 0
      : awayTotal === awayTarget;

  return {
    homeTarget,
    awayTarget,
    homeTotal,
    awayTotal,
    homeCount,
    awayCount,
    totalCount: homeCount + awayCount,
    homeExceeded: homeGoalsExceeded || homeScorersExceeded,
    awayExceeded: awayGoalsExceeded || awayScorersExceeded,
    homeGoalsExceeded,
    awayGoalsExceeded,
    homeScorersExceeded,
    awayScorersExceeded,
    homeIncomplete,
    awayIncomplete,
    homeComplete,
    awayComplete,
    isComplete: homeComplete && awayComplete,
    anyIncomplete: homeIncomplete || awayIncomplete,
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
