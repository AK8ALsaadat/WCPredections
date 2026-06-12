import type { FinishType, Match } from "@prisma/client";
import { getMatchResult } from "@/lib/utils";

/** نقاط النتيجة الصحيحة بالضبط */
export const EXACT_SCORE_POINTS = 5;

/** بونص إضافي عند توقع النتيجة بالضبط + كل الهدافين صح */
export const PERFECT_PREDICTION_BONUS_POINTS = 3;

export function calculateScorePredictionPoints(
  predHome: number,
  predAway: number,
  actualHome: number,
  actualAway: number,
  isDouble: boolean
): number {
  let basePoints = 0;

  if (predHome === actualHome && predAway === actualAway) {
    basePoints = EXACT_SCORE_POINTS;
  } else {
    const predicted = getMatchResult(predHome, predAway);
    const actual = getMatchResult(actualHome, actualAway);
    if (predicted === actual) {
      basePoints = 1;
    }
  }

  return isDouble ? basePoints * 2 : basePoints;
}

export function isExactScorePrediction(
  predHome: number,
  predAway: number,
  actualHome: number,
  actualAway: number
): boolean {
  return predHome === actualHome && predAway === actualAway;
}

/**
 * بونص +3 إذا توقع المستخدم النتيجة بالضبط، وكل أهداف الهدافين اللي اختارهم
 * تحققت فعلياً (ما فيه أي هدف متوقع زايد عن الواقع).
 */
export function calculatePerfectPredictionBonus(
  isExactScore: boolean,
  scorerPicks: { predictedGoals: number; actualGoals: number | undefined }[]
): number {
  if (!isExactScore) return 0;

  const totalPredicted = scorerPicks.reduce(
    (sum, p) => sum + p.predictedGoals,
    0
  );
  const totalEarned = scorerPicks.reduce(
    (sum, p) => sum + calculateScorerPredictionPoints(p.predictedGoals, p.actualGoals),
    0
  );

  return totalEarned === totalPredicted ? PERFECT_PREDICTION_BONUS_POINTS : 0;
}

export function calculateFinishTypePoints(
  predicted: FinishType | null | undefined,
  actual: FinishType | null | undefined
): number {
  if (!predicted || !actual) return 0;
  return predicted === actual ? 1 : 0;
}

export function calculatePenaltyWinnerPoints(
  predictedTeamId: string | null | undefined,
  actualTeamId: string | null | undefined
): number {
  if (!predictedTeamId || !actualTeamId) return 0;
  return predictedTeamId === actualTeamId ? 1 : 0;
}

export function isMatchFinishedForScoring(match: Match): boolean {
  return (
    match.status === "FINISHED" &&
    match.homeScore !== null &&
    match.awayScore !== null
  );
}

/** نقاط الهدافين والبطاقة الجريئة — أثناء المباراة أو بعدها */
export function isMatchEligibleForScorerPoints(match: Match): boolean {
  return (
    (match.status === "LIVE" || match.status === "FINISHED") &&
    match.homeScore !== null &&
    match.awayScore !== null
  );
}

export type MatchScorerRow = {
  playerId: string;
  goals: number;
  player: { teamId: string };
};

/** توزيع أهداف الملعب فقط — بدون ركلات الترجيح بعد 120 دقيقة */
function allocateRegulationGoals(
  teamScorers: MatchScorerRow[],
  regulationTotal: number,
  out: Map<string, number>
) {
  let remaining = regulationTotal;
  for (const scorer of teamScorers) {
    if (remaining <= 0) {
      out.set(scorer.playerId, 0);
      continue;
    }
    const credited = Math.min(scorer.goals, remaining);
    out.set(scorer.playerId, credited);
    remaining -= credited;
  }
}

export function buildRegulationScorerGoalsMap(
  homeTeamId: string,
  awayTeamId: string,
  homeScore: number,
  awayScore: number,
  scorers: MatchScorerRow[]
): Map<string, number> {
  const result = new Map<string, number>();
  const home = scorers.filter((s) => s.player.teamId === homeTeamId);
  const away = scorers.filter((s) => s.player.teamId === awayTeamId);

  allocateRegulationGoals(home, homeScore, result);
  allocateRegulationGoals(away, awayScore, result);
  return result;
}

/** أهداف تُحسب لنقاط الهدافين — ركلات الترجيح بعد 120 دقيقة مستثناة */
export function getScorerGoalsForPoints(
  match: {
    actualFinishType: FinishType | null;
    homeTeamId: string;
    awayTeamId: string;
    homeScore: number;
    awayScore: number;
  },
  scorers: MatchScorerRow[]
): Map<string, number> {
  if (match.actualFinishType !== "PENALTIES") {
    return new Map(scorers.map((s) => [s.playerId, s.goals]));
  }

  return buildRegulationScorerGoalsMap(
    match.homeTeamId,
    match.awayTeamId,
    match.homeScore,
    match.awayScore,
    scorers
  );
}

export function calculateScorerPredictionPoints(
  predictedGoals: number,
  actualGoals: number | undefined
): number {
  if (actualGoals == null || actualGoals <= 0) return 0;
  return Math.min(predictedGoals, actualGoals);
}

/** البطاقة الجريئة — تراهن على هداف مرة واحدة كل جولة */
export const BOLD_SCORER_POINTS = 4;

export function calculateBoldScorerBetPoints(regulationGoals: number): number {
  return regulationGoals > 0 ? BOLD_SCORER_POINTS : -BOLD_SCORER_POINTS;
}
