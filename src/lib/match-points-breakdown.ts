import { getMatchResult } from "@/lib/utils";
import { ar } from "@/lib/i18n/ar";
import type { FinishType } from "@prisma/client";

export type PointsBreakdownLine = {
  id: string;
  label: string;
  detail?: string;
  points: number;
};

export type MatchPointsBreakdownInput = {
  homeScore: number;
  awayScore: number;
  isKnockout: boolean;
  actualFinishType?: FinishType | null;
  penaltyWinnerTeamId?: string | null;
  homeTeamName: string;
  awayTeamName: string;
  userPrediction?: {
    predHome: number;
    predAway: number;
    isDouble: boolean;
    points: number;
    finishTypePoints: number;
    penaltyWinnerPoints: number;
    predictedFinishType?: FinishType | null;
    predictedPenaltyWinnerTeamId?: string | null;
  } | null;
  userScorerPredictions?: {
    predictedGoals: number;
    points: number;
    player: { name: string };
  }[];
  userBoldScorerBet?: {
    points: number;
    player: { name: string };
  } | null;
};

function scoreBreakdownLine(
  input: MatchPointsBreakdownInput
): PointsBreakdownLine | null {
  const p = input.userPrediction;
  if (!p || p.points === 0) return null;

  const exact =
    p.predHome === input.homeScore && p.predAway === input.awayScore;
  const predicted = getMatchResult(p.predHome, p.predAway);
  const actual = getMatchResult(input.homeScore, input.awayScore);
  const winnerCorrect = predicted === actual;

  let label: string = ar.pointsBreakdown.winnerCorrect;
  if (exact) {
    label = ar.pointsBreakdown.exactScore;
  }

  const detail = exact
    ? ar.pointsBreakdown.exactDetail(
        p.predHome,
        p.predAway,
        input.homeScore,
        input.awayScore
      )
    : ar.pointsBreakdown.winnerDetail(
        p.predHome,
        p.predAway,
        input.homeScore,
        input.awayScore
      );

  const multiplier = p.isDouble ? ` (${ar.pointsBreakdown.doubled})` : "";

  return {
    id: "score",
    label: label + multiplier,
    detail,
    points: p.points,
  };
}

function finishTypeLine(
  input: MatchPointsBreakdownInput
): PointsBreakdownLine | null {
  const p = input.userPrediction;
  if (!p || !input.isKnockout || p.finishTypePoints === 0) return null;

  return {
    id: "finish-type",
    label: ar.pointsBreakdown.finishTypeCorrect,
    detail: p.predictedFinishType
      ? ar.pointsBreakdown.finishTypeDetail(p.predictedFinishType)
      : undefined,
    points: p.finishTypePoints,
  };
}

export function buildMatchPointsBreakdown(
  input: MatchPointsBreakdownInput & {
    penaltyWinnerName?: string | null;
  }
): { total: number; lines: PointsBreakdownLine[] } {
  const lines: PointsBreakdownLine[] = [];

  const scoreLine = scoreBreakdownLine(input);
  if (scoreLine) lines.push(scoreLine);

  const finishLine = finishTypeLine(input);
  if (finishLine) lines.push(finishLine);

  if (input.userPrediction?.penaltyWinnerPoints) {
    lines.push({
      id: "penalty",
      label: ar.pointsBreakdown.penaltyCorrect,
      detail: input.penaltyWinnerName ?? undefined,
      points: input.userPrediction.penaltyWinnerPoints,
    });
  }

  for (const sp of input.userScorerPredictions ?? []) {
    if (sp.points > 0) {
      lines.push({
        id: `scorer-${sp.player.name}`,
        label: ar.pointsBreakdown.scorerHit(sp.player.name),
        detail:
          sp.predictedGoals > 1
            ? ar.pointsBreakdown.scorerGoalsDetail(sp.predictedGoals)
            : undefined,
        points: sp.points,
      });
    }
  }

  if (input.userBoldScorerBet && input.userBoldScorerBet.points !== 0) {
    const bold = input.userBoldScorerBet;
    lines.push({
      id: "bold-scorer",
      label:
        bold.points > 0
          ? ar.pointsBreakdown.boldScorerWin(bold.player.name)
          : ar.pointsBreakdown.boldScorerMiss(bold.player.name),
      detail: ar.pointsBreakdown.boldScorerDetail,
      points: bold.points,
    });
  }

  const total = lines.reduce((sum, line) => sum + line.points, 0);

  return { total, lines };
}

export function getMatchTotalUserPoints(input: MatchPointsBreakdownInput) {
  const p = input.userPrediction;
  const scoreTotal =
    (p?.points ?? 0) +
    (p?.finishTypePoints ?? 0) +
    (p?.penaltyWinnerPoints ?? 0);
  const scorerTotal =
    input.userScorerPredictions?.reduce((s, sp) => s + sp.points, 0) ?? 0;
  const boldTotal = input.userBoldScorerBet?.points ?? 0;
  return scoreTotal + scorerTotal + boldTotal;
}
