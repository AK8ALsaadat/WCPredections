import { asFinishType } from "@/lib/finish-type";
import { isPredictionLocked } from "@/lib/utils";
import type { MatchPointsBreakdownInput } from "@/lib/match-points-breakdown";

export type HistoryMatch = {
  id: string;
  matchTime: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  isKnockout: boolean;
  actualFinishType: string | null;
  penaltyWinnerTeamId: string | null;
  homeTeam: { id: string; name: string; shortName: string };
  awayTeam: { id: string; name: string; shortName: string };
  round: { id: string; name: string };
  goalkeeperStats?: { playerId: string; saves: number }[];
};

export type MatchHistoryEntry = {
  match: HistoryMatch;
  prediction: {
    predHome: number;
    predAway: number;
    isDouble: boolean;
    points: number;
    doubleBonus: number;
    finishTypePoints: number;
    penaltyWinnerPoints: number;
    predictedFinishType: string | null;
    predictedPenaltyWinnerTeamId: string | null;
  } | null;
  scorers: {
    points: number;
    predictedGoals: number;
    player: { name: string };
  }[];
  bold: {
    points: number;
    player: { name: string };
  } | null;
  octopus: {
    points: number;
    playerId?: string;
    saves?: number | null;
    goalsConceded?: number | null;
    player: { name: string; teamId?: string | null };
  } | null;
};

type RawHistory = {
  predictions: {
    predHome: number;
    predAway: number;
    isDouble: boolean;
    points: number;
    doubleBonus: number;
    finishTypePoints: number;
    penaltyWinnerPoints: number;
    predictedFinishType: string | null;
    predictedPenaltyWinnerTeamId: string | null;
    match: HistoryMatch;
  }[];
  scorerPredictions: {
    points: number;
    predictedGoals: number;
    player: { name: string };
    match: HistoryMatch;
  }[];
  boldScorerBets: {
    points: number;
    player: { name: string };
    match: HistoryMatch;
  }[];
  octopusBets: {
    playerId?: string;
    points: number;
    player: { name: string; teamId?: string | null };
    match: HistoryMatch;
  }[];
};

function getGoalsConceded(match: HistoryMatch, teamId?: string | null) {
  if (!teamId) return null;
  if (teamId === match.homeTeam.id) return match.awayScore;
  if (teamId === match.awayTeam.id) return match.homeScore;
  return null;
}

export function buildMatchHistoryEntries(history: RawHistory): MatchHistoryEntry[] {
  const byMatch = new Map<string, MatchHistoryEntry>();

  for (const prediction of history.predictions) {
    byMatch.set(prediction.match.id, {
      match: prediction.match,
      prediction,
      scorers: [],
      bold: null,
      octopus: null,
    });
  }

  for (const scorer of history.scorerPredictions) {
    const existing = byMatch.get(scorer.match.id) ?? {
      match: scorer.match,
      prediction: null,
      scorers: [],
      bold: null,
      octopus: null,
    };
    existing.scorers.push(scorer);
    byMatch.set(scorer.match.id, existing);
  }

  for (const bold of history.boldScorerBets) {
    const existing = byMatch.get(bold.match.id) ?? {
      match: bold.match,
      prediction: null,
      scorers: [],
      bold: null,
      octopus: null,
    };
    existing.bold = bold;
    byMatch.set(bold.match.id, existing);
  }

  for (const octopus of history.octopusBets ?? []) {
    const existing = byMatch.get(octopus.match.id) ?? {
      match: octopus.match,
      prediction: null,
      scorers: [],
      bold: null,
      octopus: null,
    };
    existing.octopus = {
      ...octopus,
      saves:
        octopus.match.goalkeeperStats?.find(
          (stat) => stat.playerId === octopus.playerId
        )?.saves ?? null,
      goalsConceded: getGoalsConceded(octopus.match, octopus.player.teamId),
    };
    byMatch.set(octopus.match.id, existing);
  }

  const statusPriority: Record<string, number> = {
    SCHEDULED: 0,
    LIVE: 1,
    FINISHED: 2,
    POSTPONED: 3,
    CANCELLED: 4,
  };

  return Array.from(byMatch.values()).filter((entry) => {
    if (entry.match.status !== "SCHEDULED") return true;
    return isPredictionLocked(entry.match.matchTime);
  }).sort((a, b) => {
    const statusDiff =
      (statusPriority[a.match.status] ?? 5) -
      (statusPriority[b.match.status] ?? 5);
    if (statusDiff !== 0) return statusDiff;

    if (a.match.status === "SCHEDULED") {
      return (
        new Date(a.match.matchTime).getTime() -
        new Date(b.match.matchTime).getTime()
      );
    }

    return (
      new Date(b.match.matchTime).getTime() -
      new Date(a.match.matchTime).getTime()
    );
  });
}

export type PredictionOutcome = "pending" | "exact" | "winner" | "wrong" | "none";

export function getPredictionOutcome(entry: MatchHistoryEntry): PredictionOutcome {
  if (!entry.prediction) return "none";
  const m = entry.match;
  if (m.status !== "FINISHED" || m.homeScore == null || m.awayScore == null) {
    return "pending";
  }
  if (entry.prediction.points >= 3) return "exact";
  if (entry.prediction.points > 0) return "winner";
  return "wrong";
}

export function entryToBreakdownInput(
  entry: MatchHistoryEntry
): (MatchPointsBreakdownInput & { penaltyWinnerName?: string | null }) | null {
  const m = entry.match;
  if (
    !["LIVE", "FINISHED"].includes(m.status) ||
    m.homeScore == null ||
    m.awayScore == null
  ) {
    return null;
  }

  const penaltyWinnerName =
    m.penaltyWinnerTeamId === m.homeTeam.id
      ? m.homeTeam.name
      : m.penaltyWinnerTeamId === m.awayTeam.id
        ? m.awayTeam.name
        : null;

  return {
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    isKnockout: m.isKnockout,
    actualFinishType: asFinishType(m.actualFinishType),
    penaltyWinnerTeamId: m.penaltyWinnerTeamId,
    homeTeamName: m.homeTeam.name,
    awayTeamName: m.awayTeam.name,
    penaltyWinnerName,
    userPrediction: entry.prediction
      ? {
          predHome: entry.prediction.predHome,
          predAway: entry.prediction.predAway,
          isDouble: entry.prediction.isDouble,
          points: entry.prediction.points,
          doubleBonus: entry.prediction.doubleBonus,
          finishTypePoints: entry.prediction.finishTypePoints,
          penaltyWinnerPoints: entry.prediction.penaltyWinnerPoints,
          predictedFinishType: asFinishType(entry.prediction.predictedFinishType),
          predictedPenaltyWinnerTeamId:
            entry.prediction.predictedPenaltyWinnerTeamId,
        }
      : null,
    userScorerPredictions: entry.scorers.map((sp) => ({
      predictedGoals: sp.predictedGoals,
      points: sp.points,
      player: { name: sp.player.name },
    })),
    userBoldScorerBet: entry.bold
      ? {
          points: entry.bold.points,
          player: { name: entry.bold.player.name },
        }
      : null,
    userOctopusBet: entry.octopus
      ? {
          points: entry.octopus.points,
          saves: entry.octopus.saves ?? null,
          goalsConceded: entry.octopus.goalsConceded ?? null,
          player: { name: entry.octopus.player.name },
        }
      : null,
  };
}
