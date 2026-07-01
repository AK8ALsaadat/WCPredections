import { getMatchResult } from "@/lib/utils";
import type { Messages } from "@/lib/i18n/ar";
import type { FinishType } from "@prisma/client";
import {
  getOctopusConcededCapLabel,
  getOctopusConcededCapPoints,
  getOctopusCleanSheetBonus,
  getOctopusSaveTierPoints,
} from "@/lib/octopus-points";
import {
  EXACT_SCORE_POINTS,
  PERFECT_PREDICTION_BONUS_POINTS,
} from "@/services/scoring.service";

/** تحويل موضع اللاعب الإنجليزي إلى عربي مع عدد النقاط */
function getPositionLabel(position: string | null | undefined): string {
  if (!position) return "";

  const lower = position.toLowerCase();

  if (
    lower.includes("attacker") ||
    lower.includes("forward") ||
    lower.includes("striker")
  ) {
    return "🔴 مهاجم (1 نقطة)";
  }

  if (lower.includes("midfielder") || lower.includes("mid")) {
    return "🟡 وسط (2 نقطة)";
  }

  if (
    lower.includes("defender") ||
    lower.includes("defence") ||
    lower.includes("defense")
  ) {
    return "🟢 مدافع (3 نقاط)";
  }

  return "";
}

function boldScorerDetail(messages: Messages, highValue: boolean): string {
  if (!highValue) return messages.pointsBreakdown.boldScorerDetail;

  const base = messages.pointsBreakdown.boldScorerDetail;
  const english = base.toLowerCase().includes("once");
  return english
    ? "Double + bet from the quarter-finals: +10 / -10"
    : "مع المضاعفة من ربع النهائي: +10 / -10";
}

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
  /** أثناء المباراة — الهدافين والبطاقة الجريئة فقط */
  scorersOnly?: boolean;
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
    doubleBonus: number;
    finishTypePoints: number;
    penaltyWinnerPoints: number;
    predictedFinishType?: FinishType | null;
    predictedPenaltyWinnerTeamId?: string | null;
  } | null;
  userScorerPredictions?: {
    predictedGoals: number;
    points: number;
    player: { name: string; position?: string | null };
  }[];
  userBoldScorerBet?: {
    points: number;
    player: { name: string };
  } | null;
  userOctopusBet?: {
    points: number;
    saves?: number | null;
    goalsConceded?: number | null;
    player: { name: string };
  } | null;
};

/** بونص +3 إذا كانت النتيجة دقيقة وكل توقعات الهدافين صحيحة بالكامل */
function computePerfectBonus(input: MatchPointsBreakdownInput): number {
  const p = input.userPrediction;
  if (!p) return 0;

  const exact =
    p.predHome === input.homeScore && p.predAway === input.awayScore;
  if (!exact) return 0;
  if (
    input.isKnockout &&
    (!input.actualFinishType ||
      p.predictedFinishType !== input.actualFinishType)
  ) {
    return 0;
  }

  const storedBonus = p.points - EXACT_SCORE_POINTS;
  return storedBonus === PERFECT_PREDICTION_BONUS_POINTS
    ? PERFECT_PREDICTION_BONUS_POINTS
    : 0;
}

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

  if (exact) {
    const bonus = computePerfectBonus(input);
    return {
      id: "score",
      label: messages.pointsBreakdown.exactScore,
      detail,
      points: p.points - bonus,
      correct: true,
    };
  }

  if (winnerCorrect) {
    return {
      id: "score",
      label: messages.pointsBreakdown.winnerCorrect,
      detail,
      points: p.points,
      correct: true,
    };
  }

  return {
    id: "score",
    label: messages.pointsBreakdown.scoreWrong,
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
  if (
    p?.predictedFinishType !== "PENALTIES" ||
    !p.predictedPenaltyWinnerTeamId
  ) {
    return null;
  }
  if (!showMisses && p.penaltyWinnerPoints === 0) return null;

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
  const scorersOnly = options?.scorersOnly ?? false;
  const lines: PointsBreakdownLine[] = [];

  if (!scorersOnly) {
    const scoreLine = scoreBreakdownLine(input, messages, showMisses);
    if (scoreLine) lines.push(scoreLine);

    const bonus = computePerfectBonus(input);
    if (bonus > 0) {
      lines.push({
        id: "perfect-bonus",
        label: messages.pointsBreakdown.perfectBonus,
        detail: messages.pointsBreakdown.perfectBonusDetail,
        points: bonus,
        correct: true,
      });
    }

    const finishLine = finishTypeLine(input, messages, showMisses);
    if (finishLine) lines.push(finishLine);

    const penalty = penaltyLine(input, messages, showMisses);
    if (penalty) lines.push(penalty);
  }

  for (const sp of input.userScorerPredictions ?? []) {
    if (!showMisses && sp.points === 0) continue;

    const hit = sp.points > 0;
    const positionLabel = getPositionLabel(sp.player.position);

    lines.push({
      id: `scorer-${sp.player.name}`,
      label: hit
        ? messages.pointsBreakdown.scorerHit(sp.player.name)
        : messages.pointsBreakdown.scorerMiss(sp.player.name),
      detail:
        sp.predictedGoals > 1
          ? messages.pointsBreakdown.scorerGoalsDetail(sp.predictedGoals) +
            (positionLabel ? ` • ${positionLabel}` : "")
          : positionLabel
            ? positionLabel
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
        detail: boldScorerDetail(messages, Math.abs(bold.points) >= 10),
        points: bold.points,
        correct: bold.points > 0,
      });
    }
  }

  if (input.userOctopusBet) {
    const octopus = input.userOctopusBet;
    if (showMisses || octopus.points !== 0) {
      const saveTierPoints = getOctopusSaveTierPoints(octopus.saves);
      const concededCap = getOctopusConcededCapPoints(octopus.goalsConceded);
      const cleanSheetBonus = getOctopusCleanSheetBonus(
        octopus.goalsConceded
      );
      const cappedByGoals =
        Number.isFinite(concededCap) && saveTierPoints > concededCap;
      const octopusDetails = [
        `نقاط التصديات قبل سقف الأهداف: +${saveTierPoints}`,
        cleanSheetBonus > 0 ? `بونص الكلين شيت: +${cleanSheetBonus}` : null,
        octopus.saves != null
          ? `${octopus.saves} تصديات رسمية`
          : "تصديات الحارس الرسمية",
        octopus.goalsConceded != null
          ? `منتخبه استقبل ${octopus.goalsConceded}`
          : null,
        getOctopusConcededCapLabel(octopus.goalsConceded),
        cappedByGoals
          ? `سقف الأهداف قلل نقاط الأخطبوط إلى +${octopus.points}`
          : null,
      ].filter(Boolean);
      lines.push({
        id: "octopus-goalkeeper",
        label: `الأخطبوط: ${octopus.player.name}`,
        detail: octopusDetails.join(" • "),
        points: octopus.points,
        correct: octopus.points > 0,
      });
    }
  }

  if (!scorersOnly && (input.userPrediction?.doubleBonus ?? 0) > 0) {
    lines.push({
      id: "double-bonus",
      label: messages.pointsBreakdown.doubleFinalTotal,
      detail: messages.pointsBreakdown.doubleFinalTotalDetail,
      points: input.userPrediction!.doubleBonus,
      correct: true,
    });
  }

  const total = scorersOnly
    ? (input.userScorerPredictions?.reduce((s, sp) => s + sp.points, 0) ?? 0) +
      (input.userBoldScorerBet?.points ?? 0) +
      (input.userOctopusBet?.points ?? 0)
    : getMatchTotalUserPoints(input);

  return { total, lines };
}

export function getMatchTotalUserPoints(input: MatchPointsBreakdownInput) {
  const p = input.userPrediction;
  const scoreTotal =
    (p?.points ?? 0) +
    (p?.doubleBonus ?? 0) +
    (p?.finishTypePoints ?? 0) +
    (p?.penaltyWinnerPoints ?? 0);
  const scorerTotal =
    input.userScorerPredictions?.reduce((s, sp) => s + sp.points, 0) ?? 0;
  const boldTotal = input.userBoldScorerBet?.points ?? 0;
  const octopusTotal = input.userOctopusBet?.points ?? 0;
  return scoreTotal + scorerTotal + boldTotal + octopusTotal;
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
      doubleBonus?: number;
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
    octopusGoalkeeperBet?: {
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
    lines.push({
      id: "score",
      label: messages.pointsBreakdown.pendingScore,
      detail: messages.pointsBreakdown.pendingScoreDetail(p.predHome, p.predAway),
      points: 0,
    });
    if (p.isDouble) {
      lines.push({
        id: "double-bonus",
        label: messages.pointsBreakdown.doubleFinalTotal,
        detail: messages.pointsBreakdown.doublePendingDetail,
        points: 0,
      });
    }
  }

  if (options.isKnockout && p?.predictedFinishType) {
    lines.push({
      id: "finish-type",
      label: messages.pointsBreakdown.pendingFinishType,
      detail: messages.pointsBreakdown.finishTypeDetail(p.predictedFinishType),
      points: 0,
    });
  }

  if (
    p?.predictedFinishType === "PENALTIES" &&
    p.predictedPenaltyWinnerTeamId
  ) {
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
      detail: boldScorerDetail(messages, Boolean(row.prediction?.isDouble)),
      points: 0,
    });
  }

  if (row.octopusGoalkeeperBet) {
    lines.push({
      id: "octopus-goalkeeper",
      label: `الأخطبوط: ${row.octopusGoalkeeperBet.player.name}`,
      detail: "التصديات والأهداف المستقبلة تظهر بعد نهاية المباراة",
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
      doubleBonus?: number;
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
    octopusGoalkeeperBet?: {
      points?: number;
      saves?: number | null;
      goalsConceded?: number | null;
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
          doubleBonus: row.prediction.doubleBonus ?? 0,
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
    userOctopusBet: row.octopusGoalkeeperBet
      ? {
          points: row.octopusGoalkeeperBet.points ?? 0,
          saves: row.octopusGoalkeeperBet.saves ?? null,
          goalsConceded: row.octopusGoalkeeperBet.goalsConceded ?? null,
          player: { name: row.octopusGoalkeeperBet.player.name },
        }
      : null,
  };
}
