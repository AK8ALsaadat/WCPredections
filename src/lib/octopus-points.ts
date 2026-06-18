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

export function getOctopusSaveTierPoints(saves: number | null | undefined) {
  const count = saves ?? 0;
  if (count >= 10) return OCTOPUS_POINTS.ten;
  if (count >= 7) return OCTOPUS_POINTS.seven;
  if (count >= 5) return OCTOPUS_POINTS.five;
  if (count >= 3) return OCTOPUS_POINTS.three;
  return 0;
}

export function calculateOctopusPoints(
  saves: number | null | undefined,
  goalsConceded?: number | null
) {
  return Math.min(
    getOctopusSaveTierPoints(saves),
    getOctopusConcededCapPoints(goalsConceded)
  );
}
