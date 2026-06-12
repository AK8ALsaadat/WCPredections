import type { Match } from '@prisma/client';
import { PERFECT_PREDICTION_MIN_MINUTE } from '@/services/scoring.service';

export type PerfectPredictionState = 'not-eligible' | 'pending' | 'confirmed' | 'cancelled';

/**
 * حالة بونص التوقع الصحيح بناءً على الوقت والحالة
 * 
 * - not-eligible: لم نصل للدقيقة 75 بعد أو النتيجة ليست بالضبط
 * - pending: وصلنا للدقيقة 75 لكن المباراة لم تنتهي (قد يتغير الهدف)
 * - confirmed: المباراة انتهت وكل شيء تم التأكيد عليه
 * - cancelled: هدف تم إلغاؤه وألغى البونص
 */
export function getPerfectPredictionBonusState(
  match: Pick<Match, 'status' | 'matchTime' | 'homeScore' | 'awayScore'>,
  prediction: { predHome: number; predAway: number },
  scorerMatches: boolean
): PerfectPredictionState {
  // التحقق من أن النتيجة صحيحة
  const isExactScore =
    prediction.predHome === match.homeScore &&
    prediction.predAway === match.awayScore;

  if (!isExactScore || !scorerMatches) {
    return 'not-eligible';
  }

  // التحقق من الدقيقة
  const minutesElapsed = (Date.now() - new Date(match.matchTime).getTime()) / (1000 * 60);

  if (minutesElapsed < PERFECT_PREDICTION_MIN_MINUTE && match.status !== 'FINISHED') {
    return 'not-eligible';
  }

  // وصلنا للدقيقة 75
  if (minutesElapsed >= PERFECT_PREDICTION_MIN_MINUTE && match.status !== 'FINISHED') {
    return 'pending';
  }

  // المباراة انتهت
  if (match.status === 'FINISHED') {
    return 'confirmed';
  }

  return 'not-eligible';
}

/**
 * يجب أن نطبق البونص الآن؟
 * 
 * - true إذا وصلنا للدقيقة 75 والتوقع صح
 * - false إذا كنا قبل الدقيقة 75
 */
export function shouldApplyPerfectBonusNow(
  match: Pick<Match, 'status' | 'matchTime'>,
  state: PerfectPredictionState
): boolean {
  return state === 'pending' || state === 'confirmed';
}

/**
 * حساب نقاط التوقع الصحيح بناءً على الحالة
 * 
 * - 0 نقاط قبل الدقيقة 75 أو إذا كانت النتيجة خاطئة
 * - +3 نقاط بعد الدقيقة 75 إذا كانت النتيجة صحيحة وكل لاعب سجل الكمية الصحيحة
 * - -3 نقاط إذا تم إلغاء هدف بعد انتهاء المباراة (من VAR)
 */
export function calculatePerfectBonusWithMinute(
  isExactScore: boolean,
  scorerMatches: boolean,
  minutesElapsed: number,
  matchFinished: boolean,
  wasConfirmed: boolean = false
): number {
  if (!isExactScore || !scorerMatches) {
    return 0;
  }

  // قبل الدقيقة 75 لا نحسب البونص
  if (minutesElapsed < PERFECT_PREDICTION_MIN_MINUTE && !matchFinished) {
    return 0;
  }

  // بعد الدقيقة 75 أو عند النهاية: +3 نقاط
  return 3;
}
