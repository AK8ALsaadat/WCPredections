import { getPredictionLockTime } from "@/lib/utils";

export const MISSING_PREDICTION_LOOKAHEAD_MS = 2 * 60 * 60 * 1000;

export function shouldShowMissingPredictionUsers(
  match: { matchTime: Date | string; status: string },
  now: Date | number = Date.now()
) {
  if (match.status !== "SCHEDULED") return false;

  const nowMs = now instanceof Date ? now.getTime() : now;
  const msUntilDeadline = getPredictionLockTime(match.matchTime).getTime() - nowMs;

  return (
    msUntilDeadline > 0 &&
    msUntilDeadline <= MISSING_PREDICTION_LOOKAHEAD_MS
  );
}
