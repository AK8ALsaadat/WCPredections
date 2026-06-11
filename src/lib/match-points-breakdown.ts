import { getMatchResult } from "@/lib/utils";
import type { Messages } from "@/lib/i18n/ar";
import type { FinishType } from "@prisma/client";

export type PointsBreakdownLine = {
  id: string;
  label: string;
  detail?: string;
  points: number;
  /** true = صح، false = خطأ، undefined = بدون أيقونة */
  correct?: boolean;
};

export type BuildMatchPointsBreakdownOptions = {
  /** عرض كل البنود بما فيها الأخطاء وصفر النقاط */
  showMisses?: boolean;
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
  input: MatchPointsBreakdownInput,
  messages: Messages,
  showMisses: boolean
): PointsBreakdownLine | null {
  const p = input.userPrediction;
  if (!p) return null;
  if (!showMisses && p.points === 0) return null;

  const exact =
    p.predHome === input.homeScore && p.predAway === input.awayScore;
  const predicted = getMatchResult(p.predHome, p.predAway);
  const actual = getMatchResult(input.homeScore, input.awayScore);
  const winnerCorrect = predicted === actual;

  const detail = messages.pointsBreakdown.predictionDetail(
    p.predHome,
    p.predAway,
    input.homeScore,
    input.awayScore
  );

  const multiplier = p.isDouble
    ? ` (${messages.pointsBreakdown.doubled})`
    : "";

  if (exact) {
    return {
      id: "score",
      label: messages.pointsBreakdown.exactScore + multiplier,
      detail,
      points: p.points,
      correct: true,
    };
  }

  if (winnerCorrect) {
    return {
      id: "score",
      label: messages.pointsBreakdown.winnerCorrect + multiplier,
      detail,
      points: p.points,
      correct: true,
    };
  }

  return {
    id: "score",
    label: messages.pointsBreakdown.scoreWrong + multiplier,
    detail,
    points: 0,
    correct: false,
  };
}

function finishTypeLine(
  input: MatchPointsBreakdownInput,
  messages: Messages,
  showMisses: boolean
): PointsBreakdownLine | null {
  const p = input.userPrediction;
  if (!p || !input.isKnockout || !p.predictedFinishType) return null;
  if (!showMisses && p.finishTypePoints === 0) return null;

  const hit = p.finishTypePoints > 0;
  return {
    id: "finish-type",
    label: hit
      ? messages.pointsBreakdown.finishTypeCorrect
      : messages.pointsBreakdown.finishTypeWrong,
    detail: messages.pointsBreakdown.finishTypeDetail(p.predictedFinishType),
    points: p.finishTypePoints,
    correct: hit,
  };
}

function penaltyLine(
  input: MatchPointsBreakdownInput & { penaltyWinnerName?: string | null },
  messages: Messages,
  showMisses: boolean
): PointsBreakdownLine | null {
  const p = input.userPrediction;
  if (!p?.predictedPenaltyWinnerTeamId) return null;
  if (!showMisses && !p.penaltyWinnerPoints) return null;

  const hit = p.penaltyWinnerPoints > 0;
  return {
    id: "penalty",
    label: hit
      ? messages.pointsBreakdown.penaltyCorrect
      : messages.pointsBreakdown.penaltyWrong,
    detail: input.penaltyWinnerName ?? undefined,
    points: p.penaltyWinnerPoints,
    correct: hit,
  };
}

export function buildMatchPointsBreakdown(
  input: MatchPointsBreakdownInput & {
    penaltyWinnerName?: string | null;
  },
  messages: Messages,
  options?: BuildMatchPointsBreakdownOptions
): { total: number; lines: PointsBreakdownLine[] } {
  const showMisses = options?.showMisses ?? false;
  const lines: PointsBreakdownLine[] = [];

  const scoreLine = scoreBreakdownLine(input, messages, showMisses);
  if (scoreLine) lines.push(scoreLine);

  const finishLine = finishTypeLine(input, messages, showMisses);
  if (finishLine) lines.push(finishLine);

  const penalty = penaltyLine(input, messages, showMisses);
  if (penalty) lines.push(penalty);

  for (const sp of input.userScorerPredictions ?? []) {
    if (!showMisses && sp.points === 0) continue;
    const hit = sp.points > 0;
    lines.push({
      id: `scorer-${sp.player.name}`,
      label: hit
        ? messages.pointsBreakdown.scorerHit(sp.player.name)
        : messages.pointsBreakdown.scorerMiss(sp.player.name),
      detail:
        sp.predictedGoals > 1
          ? messages.pointsBreakdown.scorerGoalsDetail(sp.predictedGoals)
          : undefined,
      points: sp.points,
      correct: hit,
    });
  }

  if (input.userBoldScorerBet) {
    const bold = input.userBoldScorerBet;
    if (showMisses || bold.points !== 0) {
      lines.push({
        id: "bold-scorer",
        label:
          bold.points > 0
            ? messages.pointsBreakdown.boldScorerWin(bold.player.name)
            : messages.pointsBreakdown.boldScorerMiss(bold.player.name),
        detail: messages.pointsBreakdown.boldScorerDetail,
        points: bold.points,
        correct: bold.points > 0,
      });
    }
  }

  const total = getMatchTotalUserPoints(input);

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

export type LeagueMatchResultContext = {
  homeScore: number;
  awayScore: number;
  isKnockout: boolean;
  actualFinishType?: FinishType | null;
  penaltyWinnerTeamId?: string | null;
  homeTeamName: string;
  awayTeamName: string;
  penaltyWinnerName?: string | null;
};

export function buildLeaguePendingBreakdown(
  row: {
    prediction: {
      predHome: number;
      predAway: number;
      isDouble: boolean;
      predictedFinishType?: string | null;
      predictedPenaltyWinnerTeamId?: string | null;
    } | null;
    scorerPredictions: {
      predictedGoals: number;
      player: { name: string };
    }[];
    boldScorerBet: {
      player: { name: string };
    } | null;
  },
  options: {
    isKnockout: boolean;
    homeTeamId: string;
    awayTeamId: string;
    homeShortName: string;
    awayShortName: string;
  },
  messages: Messages
): { total: number; lines: PointsBreakdownLine[] } {
  const lines: PointsBreakdownLine[] = [];
  const p = row.prediction;

  if (p) {
    const multiplier = p.isDouble
      ? ` (${messages.pointsBreakdown.doubled})`
      : "";
    lines.push({
      id: "score",
      label: messages.pointsBreakdown.pendingScore + multiplier,
      detail: messages.pointsBreakdown.pendingScoreDetail(p.predHome, p.predAway),
      points: 0,
    });
  }

  if (options.isKnockout && p?.predictedFinishType) {
    lines.push({
      id: "finish-type",
      label: messages.pointsBreakdown.pendingFinishType,
      detail: messages.pointsBreakdown.finishTypeDetail(p.predictedFinishType),
      points: 0,
    });
  }

  if (p?.predictedPenaltyWinnerTeamId) {
    const penaltyShort =
      p.predictedPenaltyWinnerTeamId === options.homeTeamId
        ? options.homeShortName
        : p.predictedPenaltyWinnerTeamId === options.awayTeamId
          ? options.awayShortName
          : null;
    lines.push({
      id: "penalty",
      label: messages.pointsBreakdown.pendingPenalty,
      detail: penaltyShort ?? undefined,
      points: 0,
    });
  }

  for (const sp of row.scorerPredictions) {
    lines.push({
      id: `scorer-${sp.player.name}`,
      label: messages.pointsBreakdown.pendingScorer(sp.player.name),
      detail:
        sp.predictedGoals > 1
          ? messages.pointsBreakdown.scorerGoalsDetail(sp.predictedGoals)
          : undefined,
      points: 0,
    });
  }

  if (row.boldScorerBet) {
    lines.push({
      id: "bold-scorer",
      label: messages.pointsBreakdown.pendingBold(row.boldScorerBet.player.name),
      detail: messages.pointsBreakdown.boldScorerDetail,
      points: 0,
    });
  }

  return { total: 0, lines };
}

export function leagueRowToBreakdownInput(
  row: {
    prediction: {
      predHome: number;
      predAway: number;
      isDouble: boolean;
      predictedFinishType?: string | null;
      predictedPenaltyWinnerTeamId?: string | null;
      points?: number;
      finishTypePoints?: number;
      penaltyWinnerPoints?: number;
    } | null;
    scorerPredictions: {
      predictedGoals: number;
      points?: number;
      player: { name: string };
    }[];
    boldScorerBet: {
      points?: number;
      player: { name: string };
    } | null;
  },
  match: LeagueMatchResultContext
): MatchPointsBreakdownInput & { penaltyWinnerName?: string | null } {
  return {
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    isKnockout: match.isKnockout,
    actualFinishType: match.actualFinishType,
    penaltyWinnerTeamId: match.penaltyWinnerTeamId,
    homeTeamName: match.homeTeamName,
    awayTeamName: match.awayTeamName,
    penaltyWinnerName: match.penaltyWinnerName,
    userPrediction: row.prediction
      ? {
          predHome: row.prediction.predHome,
          predAway: row.prediction.predAway,
          isDouble: row.prediction.isDouble,
          points: row.prediction.points ?? 0,
          finishTypePoints: row.prediction.finishTypePoints ?? 0,
          penaltyWinnerPoints: row.prediction.penaltyWinnerPoints ?? 0,
          predictedFinishType: row.prediction
            .predictedFinishType as FinishType | null,
          predictedPenaltyWinnerTeamId:
            row.prediction.predictedPenaltyWinnerTeamId,
        }
      : null,
    userScorerPredictions: row.scorerPredictions.map((sp) => ({
      predictedGoals: sp.predictedGoals,
      points: sp.points ?? 0,
      player: { name: sp.player.name },
    })),
    userBoldScorerBet: row.boldScorerBet
      ? {
          points: row.boldScorerBet.points ?? 0,
          player: { name: row.boldScorerBet.player.name },
        }
      : null,
  };
}
