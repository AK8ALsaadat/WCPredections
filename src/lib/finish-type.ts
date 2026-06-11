import type { FinishType } from "@prisma/client";

const FINISH_TYPES: FinishType[] = [
  "NINETY_MINUTES",
  "EXTRA_TIME",
  "PENALTIES",
];

export function asFinishType(
  value: string | null | undefined
): FinishType | null {
  if (!value) return null;
  return FINISH_TYPES.includes(value as FinishType)
    ? (value as FinishType)
    : null;
}
