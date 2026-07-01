import type { FinishType, Match } from "@prisma/client";
import { normalizeTeamIdentity } from "@/lib/team-identity";
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
  _isDouble = false,
  context?: {
    homeTeamId?: string | null;
    awayTeamId?: string | null;
    predictedFinishType?: FinishType | null;
    predictedPenaltyWinnerTeamId?: string | null;
    actualFinishType?: FinishType | null;
    actualPenaltyWinnerTeamId?: string | null;
  }
): number {
  let basePoints = 0;

  if (predHome === actualHome && predAway === actualAway) {
    basePoints = EXACT_SCORE_POINTS;
  } else {
    const predicted = getPredictedMatchOutcome(predHome, predAway, context);
    const actual = getActualMatchOutcome(actualHome, actualAway, context);
    if (predicted === actual) {
      basePoints = 1;
    }
  }

  return basePoints;
}

type MatchOutcome = "home" | "away" | "draw";

function teamIdToOutcome(
  teamId: string | null | undefined,
  context?: { homeTeamId?: string | null; awayTeamId?: string | null }
): MatchOutcome | null {
  if (!teamId) return null;
  if (context?.homeTeamId && teamId === context.homeTeamId) return "home";
  if (context?.awayTeamId && teamId === context.awayTeamId) return "away";
  return null;
}

function getPredictedMatchOutcome(
  predHome: number,
  predAway: number,
  context?: {
    homeTeamId?: string | null;
    awayTeamId?: string | null;
    predictedFinishType?: FinishType | null;
    predictedPenaltyWinnerTeamId?: string | null;
  }
): MatchOutcome {
  if (predHome > predAway) return "home";
  if (predAway > predHome) return "away";

  if (context?.predictedFinishType === "PENALTIES") {
    return (
      teamIdToOutcome(context.predictedPenaltyWinnerTeamId, context) ?? "draw"
    );
  }

  return getMatchResult(predHome, predAway) as MatchOutcome;
}

function getActualMatchOutcome(
  actualHome: number,
  actualAway: number,
  context?: {
    homeTeamId?: string | null;
    awayTeamId?: string | null;
    actualFinishType?: FinishType | null;
    actualPenaltyWinnerTeamId?: string | null;
  }
): MatchOutcome {
  if (actualHome > actualAway) return "home";
  if (actualAway > actualHome) return "away";

  if (context?.actualFinishType === "PENALTIES") {
    return (
      teamIdToOutcome(context.actualPenaltyWinnerTeamId, context) ?? "draw"
    );
  }

  return getMatchResult(actualHome, actualAway) as MatchOutcome;
}

export function calculateDoubleBonus(
  isDouble: boolean,
  baseMatchPoints: number
): number {
  return isDouble ? baseMatchPoints : 0;
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
 * بونص +3 إذا توقع المستخدم النتيجة بالضبط، وكل لاعب سجل بالضبط عدد الأهداف
 * المتوقعة لهم (لا يكفي أن يكون المجموع صح — كل لاعب تفصيلياً بيكون صح).
 */
export function calculatePerfectPredictionBonus(
  isExactScore: boolean,
  scorerPicks: { predictedGoals: number; actualGoals: number | undefined; position?: string | null }[],
  options?: { ignorePositionMultiplier?: boolean; finishTypeCorrect?: boolean }
): number {
  if (!isExactScore) return 0;
  if (options?.finishTypeCorrect === false) return 0;

  // Check that every player scored their exact predicted goals
  const allExact = scorerPicks.every(p => p.actualGoals === p.predictedGoals);
  return allExact ? PERFECT_PREDICTION_BONUS_POINTS : 0;
}

export function calculateFinishTypePoints(
  predicted: FinishType | null | undefined,
  actual: FinishType | null | undefined
): number {
  if (!predicted || !actual) return 0;
  if (predicted !== actual) return 0;

  if (actual === "PENALTIES") return 4;
  if (actual === "EXTRA_TIME") return 2;
  return 1;
}

export function calculatePenaltyWinnerPoints(
  predictedTeamId: string | null | undefined,
  actualTeamId: string | null | undefined
): number {
  void predictedTeamId;
  void actualTeamId;
  return 0;
}

export function calculateKnockoutPenaltyWinnerPoints(
  predictedFinishType: FinishType | null | undefined,
  predictedTeamId: string | null | undefined,
  actualTeamId: string | null | undefined
): number {
  void predictedFinishType;
  void predictedTeamId;
  void actualTeamId;
  return 0;
}

export function isMatchFinishedForScoring(match: Match): boolean {
  return (
    match.status === "FINISHED" &&
    match.homeScore !== null &&
    match.awayScore !== null
  );
}

/** 
 * الحد الأدنى من الدقائق المسموحة قبل حساب بونص التوقع الصحيح
 * لا يتم حساب البونص حتى نصل للدقيقة 75 (أو نهاية المباراة)
 */
// Stale LIVE knockout matches with a winner still need finish-type points.
export const FINISH_TYPE_INFERENCE_MIN_MINUTE = 150;

type MatchForScoringFinishType = Pick<
  Match,
  | "actualFinishType"
  | "awayScore"
  | "homeScore"
  | "isKnockout"
  | "matchTime"
  | "status"
>;

export function resolveScoringActualFinishType(
  match: MatchForScoringFinishType,
  options?: { now?: Date | number }
): FinishType | null {
  if (match.actualFinishType) return match.actualFinishType;
  if (!match.isKnockout) return null;
  if (match.homeScore === null || match.awayScore === null) return null;

  if (match.status === "FINISHED") {
    return match.homeScore === match.awayScore ? "PENALTIES" : "NINETY_MINUTES";
  }

  if (match.status !== "LIVE") return null;
  if (match.homeScore === match.awayScore) return null;

  const nowMs =
    options?.now instanceof Date
      ? options.now.getTime()
      : typeof options?.now === "number"
        ? options.now
        : Date.now();
  const minutesElapsed =
    (nowMs - new Date(match.matchTime).getTime()) / (1000 * 60);

  return Number.isFinite(minutesElapsed) &&
    minutesElapsed >= FINISH_TYPE_INFERENCE_MIN_MINUTE
    ? "NINETY_MINUTES"
    : null;
}

// Minimum elapsed minute before the perfect prediction bonus can be awarded.
export const PERFECT_PREDICTION_MIN_MINUTE = 75;

/**
 * تصفية أهداف قبل دقيقة معينة — لاستخدام في حساب بونص التوقع الصحيح
 * @param scorers - قائمة الهدافين مع الأهداف والدقائق
 * @param beforeMinute - الحد الأقصى للدقيقة (يشمل هذه الدقيقة)
 * @returns خريطة من playerId -> عدد الأهداف قبل هذه الدقيقة
 */
export function getScorerGoalsBeforeMinute(
  scorers: Array<{ playerId: string; goals: number; minute?: number | null }>,
  beforeMinute: number
): Map<string, number> {
  const result = new Map<string, number>();
  
  for (const scorer of scorers) {
    // إذا لم تكن الدقيقة متوفرة، نفترض أن الهدف قبل الدقيقة المطلوبة
    const minute = scorer.minute ?? 0;
    const goalsBeforeMinute = minute <= beforeMinute ? scorer.goals : 0;
    
    if (goalsBeforeMinute > 0) {
      result.set(scorer.playerId, goalsBeforeMinute);
    }
  }
  
  return result;
}

/**
 * حساب بونص التوقع الصحيح مع التحقق من الدقيقة 75
 * 
 * - قبل الدقيقة 75 والمباراة حية: 0 نقاط (في الانتظار)
 * - بعد الدقيقة 75 أو عند النهاية: +3 نقاط إذا كانت جميع التفاصيل صح
 * 
 * @param isExactScore - هل النتيجة صح
 * @param scorerPicks - التنبؤات والنتائج الفعلية لكل هداف
 * @param matchTime - وقت بدء المباراة
 * @param matchStatus - حالة المباراة
 * @param options - خيارات إضافية
 */
export function calculatePerfectPredictionBonusWithMinute(
  isExactScore: boolean,
  scorerPicks: { predictedGoals: number; actualGoals: number | undefined; position?: string | null }[],
  matchTime: Date,
  matchStatus: string,
  options?: { ignorePositionMultiplier?: boolean; finishTypeCorrect?: boolean }
): number {
  if (!isExactScore) return 0;
  if (options?.finishTypeCorrect === false) return 0;

  // Check that every player scored their exact predicted goals
  const allExact = scorerPicks.every(p => p.actualGoals === p.predictedGoals);
  if (!allExact) return 0;

  // التحقق من الدقيقة 75
  const minutesElapsed = (Date.now() - new Date(matchTime).getTime()) / (1000 * 60);
  const matchFinished = matchStatus === "FINISHED";

  // قبل الدقيقة 75 والمباراة حية: لا نحسب البونص
  if (minutesElapsed < PERFECT_PREDICTION_MIN_MINUTE && !matchFinished) {
    return 0;
  }

  // بعد الدقيقة 75 أو عند النهاية: +3 نقاط
  return PERFECT_PREDICTION_BONUS_POINTS;
}

export function hasRequiredScorerPicksForPerfectBonus(
  predHome: number,
  predAway: number,
  scorerPickCount: number
): boolean {
  return predHome + predAway === 0 || scorerPickCount > 0;
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
  player: {
    teamId: string;
    name?: string | null;
    team?: { name?: string | null } | null;
  };
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

function scorerBelongsToTeam(
  scorer: MatchScorerRow,
  team: { id: string; name?: string | null }
) {
  if (scorer.player.teamId === team.id) return true;

  const scorerTeamName = scorer.player.team?.name;
  if (!team.name || !scorerTeamName) return false;

  return (
    normalizeTeamIdentity(team.name) === normalizeTeamIdentity(scorerTeamName)
  );
}

export function buildRegulationScorerGoalsMap(
  homeTeamId: string,
  awayTeamId: string,
  homeScore: number,
  awayScore: number,
  scorers: MatchScorerRow[],
  options?: { homeTeamName?: string | null; awayTeamName?: string | null }
): Map<string, number> {
  const result = new Map<string, number>();
  const home = scorers.filter((s) =>
    scorerBelongsToTeam(s, {
      id: homeTeamId,
      name: options?.homeTeamName,
    })
  );
  const away = scorers.filter((s) =>
    scorerBelongsToTeam(s, {
      id: awayTeamId,
      name: options?.awayTeamName,
    })
  );

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
    homeTeamName?: string | null;
    awayTeamName?: string | null;
    homeScore: number;
    awayScore: number;
  },
  scorers: MatchScorerRow[]
): Map<string, number> {
  if (match.actualFinishType !== "PENALTIES") {
    return new Map(scorers.map((s) => [s.playerId, s.goals]));
  }

  const expectedRegulationGoals = match.homeScore + match.awayScore;
  const knownScorerGoals = scorers.reduce(
    (sum, scorer) => sum + scorer.goals,
    0
  );
  if (knownScorerGoals <= expectedRegulationGoals) {
    return new Map(scorers.map((s) => [s.playerId, s.goals]));
  }

  return buildRegulationScorerGoalsMap(
    match.homeTeamId,
    match.awayTeamId,
    match.homeScore,
    match.awayScore,
    scorers,
    {
      homeTeamName: match.homeTeamName,
      awayTeamName: match.awayTeamName,
    }
  );
}

/** نقاط الهدافين حسب الموضع */
export type PlayerPositionType = "Attacker" | "Midfielder" | "Defender" | null | undefined;

export function getPositionPointsMultiplier(position: PlayerPositionType): number {
  if (!position) return 1;
  const lower = position.toLowerCase();
  if (
    lower.includes("attacker") ||
    lower.includes("attack") ||
    lower.includes("forward") ||
    lower.includes("striker") ||
    lower.includes("offence") ||
    lower.includes("offense") ||
    lower.includes("winger")
  ) return 1;
  if (lower.includes("midfielder") || lower.includes("mid")) return 2;
  if (
    lower.includes("defender") ||
    lower.includes("defence") ||
    lower.includes("defense") ||
    lower.includes("back") ||
    lower.includes("sweeper")
  ) return 3;
  return 1;
}

export function calculateScorerPredictionPoints(
  predictedGoals: number,
  actualGoals: number | undefined,
  position?: PlayerPositionType,
  options?: { ignorePositionMultiplier?: boolean }
): number {
  if (actualGoals == null || actualGoals <= 0) return 0;
  const basePoints = Math.min(predictedGoals, actualGoals);
  const multiplier = options?.ignorePositionMultiplier
    ? 1
    : getPositionPointsMultiplier(position);
  return basePoints * multiplier;
}

/** البطاقة الجريئة — تراهن على هداف مرة واحدة كل جولة */
export const BOLD_SCORER_POINTS = 5;
export const BOLD_SCORER_POINTS_LATE_ROUND = 10;

export function calculateBoldScorerBetPoints(
  regulationGoals: number,
  options?: { highValue?: boolean }
): number {
  const points = options?.highValue ? BOLD_SCORER_POINTS_LATE_ROUND : BOLD_SCORER_POINTS;
  return regulationGoals > 0 ? points : -points;
}
