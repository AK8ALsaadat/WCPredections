export const OCTOPUS_POINTS = {
  three: 1,
  five: 3,
  seven: 5,
  ten: 8,
} as const;

export function getOctopusConcededCapPoints(
  goalsConceded: number | null | undefined
) {
  if (goalsConceded == null) return Number.POSITIVE_INFINITY;
  if (goalsConceded >= 3) return OCTOPUS_POINTS.three;
  if (goalsConceded === 2) return OCTOPUS_POINTS.five;
  if (goalsConceded === 1) return OCTOPUS_POINTS.seven;
  return Number.POSITIVE_INFINITY;
}

export function getOctopusConcededCapLabel(
  goalsConceded: number | null | undefined
) {
  if (goalsConceded == null || goalsConceded <= 0) return null;
  if (goalsConceded >= 3) {
    return "استقبال 3 أهداف فأكثر ألغى فرصة 5 تصديات (+3)";
  }
  if (goalsConceded === 2) {
    return "استقبال هدفين ألغى فرصة 7 تصديات (+5)";
  }
  return "استقبال هدف ألغى فرصة 10 تصديات (+8)";
}

export function calculateOctopusPoints(
  saves: number | null | undefined,
  goalsConceded?: number | null
) {
  const count = saves ?? 0;
  let points = 0;
  if (count >= 10) points = OCTOPUS_POINTS.ten;
  else if (count >= 7) points = OCTOPUS_POINTS.seven;
  else if (count >= 5) points = OCTOPUS_POINTS.five;
  else if (count >= 3) points = OCTOPUS_POINTS.three;

  return Math.min(points, getOctopusConcededCapPoints(goalsConceded));
}
