import { prisma } from "@/lib/prisma";
import { getAnnexAssignments } from "@/lib/wc-annex-c";
import {
  getBracketByApiMatchId,
  type BracketSlot,
} from "@/lib/wc-bracket";

const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
const PLACEHOLDER_NAME = "يُحدد لاحقاً";

type TeamStanding = {
  teamId: string;
  apiTeamId: string | null;
  name: string;
  shortName: string;
  played: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
};

type GroupStandings = Record<string, TeamStanding[]>;

function normalizeGroupCode(code: string | null | undefined): string | null {
  if (!code) return null;
  return code.replace("GROUP_", "");
}

function isPlaceholderTeam(team: {
  apiTeamId: string | null;
  name: string;
}): boolean {
  return (
    team.name === PLACEHOLDER_NAME ||
    (team.apiTeamId?.startsWith("tbd-") ?? false)
  );
}

function compareStandings(a: TeamStanding, b: TeamStanding) {
  if (b.points !== a.points) return b.points - a.points;
  if (b.goalDifference !== a.goalDifference) {
    return b.goalDifference - a.goalDifference;
  }
  return b.goalsFor - a.goalsFor;
}

export async function computeGroupStandings(
  roundId: string
): Promise<GroupStandings> {
  const matches = await prisma.match.findMany({
    where: {
      roundId,
      groupCode: { not: null },
      status: "FINISHED",
      homeScore: { not: null },
      awayScore: { not: null },
    },
    include: {
      homeTeam: true,
      awayTeam: true,
    },
  });

  const standings: GroupStandings = {};
  for (const group of GROUPS) standings[group] = [];

  const teamMap = new Map<string, TeamStanding>();

  function getStanding(group: string, team: {
    id: string;
    apiTeamId: string | null;
    name: string;
    shortName: string;
  }) {
    const key = `${group}:${team.id}`;
    if (!teamMap.has(key)) {
      teamMap.set(key, {
        teamId: team.id,
        apiTeamId: team.apiTeamId,
        name: team.name,
        shortName: team.shortName,
        played: 0,
        points: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
      });
      standings[group].push(teamMap.get(key)!);
    }
    return teamMap.get(key)!;
  }

  for (const match of matches) {
    const group = normalizeGroupCode(match.groupCode);
    if (!group) continue;

    const home = getStanding(group, match.homeTeam);
    const away = getStanding(group, match.awayTeam);
    const hs = match.homeScore!;
    const as = match.awayScore!;

    home.played++;
    away.played++;
    home.goalsFor += hs;
    home.goalsAgainst += as;
    away.goalsFor += as;
    away.goalsAgainst += hs;

    if (hs > as) home.points += 3;
    else if (hs < as) away.points += 3;
    else {
      home.points++;
      away.points++;
    }
  }

  for (const group of GROUPS) {
    for (const team of standings[group]) {
      team.goalDifference = team.goalsFor - team.goalsAgainst;
    }
    standings[group].sort(compareStandings);
  }

  return standings;
}

async function countFinishedGroupMatches(roundId: string, group: string) {
  return prisma.match.count({
    where: {
      roundId,
      groupCode: `GROUP_${group}`,
      status: "FINISHED",
    },
  });
}

function getQualifiedThirdPlaces(
  standings: GroupStandings,
  groupFinished: Record<string, boolean>
) {
  const thirds: Array<TeamStanding & { group: string }> = [];
  for (const group of GROUPS) {
    if (!groupFinished[group] || standings[group].length < 3) continue;
    thirds.push({ ...standings[group][2], group });
  }
  return thirds.sort(compareStandings).slice(0, 8);
}

function getMatchWinnerId(match: {
  homeScore: number | null;
  awayScore: number | null;
  homeTeamId: string;
  awayTeamId: string;
  penaltyWinnerTeamId: string | null;
  actualFinishType: string | null;
}): string | null {
  if (match.homeScore === null || match.awayScore === null) return null;
  if (match.actualFinishType === "PENALTIES" && match.penaltyWinnerTeamId) {
    return match.penaltyWinnerTeamId;
  }
  if (match.homeScore > match.awayScore) return match.homeTeamId;
  if (match.awayScore > match.homeScore) return match.awayTeamId;
  return null;
}

function getMatchLoserId(match: {
  homeScore: number | null;
  awayScore: number | null;
  homeTeamId: string;
  awayTeamId: string;
  penaltyWinnerTeamId: string | null;
  actualFinishType: string | null;
}): string | null {
  const winner = getMatchWinnerId(match);
  if (!winner) return null;
  return winner === match.homeTeamId ? match.awayTeamId : match.homeTeamId;
}

async function buildMatchWinnerMap(roundId: string) {
  const knockoutMatches = await prisma.match.findMany({
    where: { roundId, isKnockout: true, status: "FINISHED" },
    select: {
      apiMatchId: true,
      homeScore: true,
      awayScore: true,
      homeTeamId: true,
      awayTeamId: true,
      penaltyWinnerTeamId: true,
      actualFinishType: true,
    },
  });

  const winners = new Map<number, string>();
  const losers = new Map<number, string>();

  for (const match of knockoutMatches) {
    const bracket = getBracketByApiMatchId(match.apiMatchId);
    if (!bracket) continue;

    const winnerId = getMatchWinnerId(match);
    const loserId = getMatchLoserId(match);
    if (winnerId) winners.set(bracket.matchNo, winnerId);
    if (loserId) losers.set(bracket.matchNo, loserId);
  }

  return { winners, losers };
}

function resolveSlot(
  slot: BracketSlot,
  standings: GroupStandings,
  annex: Record<string, string> | null,
  groupFinished: Record<string, boolean>,
  winners: Map<number, string>,
  losers: Map<number, string>
): string | null {
  if (slot.type === "WINNER") {
    if (!groupFinished[slot.group]) return null;
    return standings[slot.group]?.[0]?.teamId ?? null;
  }

  if (slot.type === "RUNNER_UP") {
    if (!groupFinished[slot.group]) return null;
    return standings[slot.group]?.[1]?.teamId ?? null;
  }

  if (slot.type === "THIRD_FOR_WINNER") {
    if (!annex) return null;
    const thirdGroup = annex[slot.winnerGroup];
    if (!thirdGroup || !groupFinished[thirdGroup]) return null;
    return standings[thirdGroup]?.[2]?.teamId ?? null;
  }

  if (slot.type === "WINNER_OF") {
    return winners.get(slot.matchNo) ?? null;
  }

  if (slot.type === "LOSER_OF") {
    return losers.get(slot.matchNo) ?? null;
  }

  return null;
}

export async function advanceKnockoutTeams(roundId: string) {
  const standings = await computeGroupStandings(roundId);

  const groupFinished: Record<string, boolean> = {};
  for (const group of GROUPS) {
    groupFinished[group] =
      (await countFinishedGroupMatches(roundId, group)) >= 6;
  }

  const groupStageDone = GROUPS.every((group) => groupFinished[group]);
  const qualifiedThirds = groupStageDone
    ? getQualifiedThirdPlaces(standings, groupFinished)
    : [];
  const qualifyingGroups = qualifiedThirds.map((t) => t.group);
  const annex = groupStageDone
    ? getAnnexAssignments(qualifyingGroups)
    : null;

  const { winners, losers } = await buildMatchWinnerMap(roundId);

  const knockoutMatches = await prisma.match.findMany({
    where: { roundId, isKnockout: true },
    include: { homeTeam: true, awayTeam: true },
  });

  let updated = 0;

  for (const match of knockoutMatches) {
    const bracket = getBracketByApiMatchId(match.apiMatchId);
    if (!bracket) continue;

    const updates: { homeTeamId?: string; awayTeamId?: string } = {};

    if (isPlaceholderTeam(match.homeTeam)) {
      const teamId = resolveSlot(
        bracket.home,
        standings,
        annex,
        groupFinished,
        winners,
        losers
      );
      if (teamId) updates.homeTeamId = teamId;
    }

    if (isPlaceholderTeam(match.awayTeam)) {
      const teamId = resolveSlot(
        bracket.away,
        standings,
        annex,
        groupFinished,
        winners,
        losers
      );
      if (teamId) updates.awayTeamId = teamId;
    }

    if (updates.homeTeamId || updates.awayTeamId) {
      await prisma.match.update({
        where: { id: match.id },
        data: updates,
      });
      updated++;
    }
  }

  return {
    groupStageComplete: groupStageDone,
    qualifiedThirdGroups: qualifyingGroups,
    annexMatched: !!annex,
    knockoutMatchesUpdated: updated,
  };
}
