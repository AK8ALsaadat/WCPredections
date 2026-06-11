import type { ExternalMatch } from "@/services/football-api/types";

function parseAnchor(value: string | undefined, fallback: string): Date {
  return new Date(value ?? fallback);
}

export function shouldRemapWorldCupDates(): boolean {
  return process.env.FOOTBALL_REMAP_TO_WC26 === "true";
}

export function remapWorldCupDate(sourceDate: Date): Date {
  if (!shouldRemapWorldCupDates()) return sourceDate;

  const sourceStart = parseAnchor(
    process.env.FOOTBALL_WC_SOURCE_START,
    "2022-11-20T00:00:00.000Z"
  );
  const targetStart = parseAnchor(
    process.env.FOOTBALL_WC26_START,
    "2026-06-11T00:00:00.000Z"
  );

  const offsetMs = sourceDate.getTime() - sourceStart.getTime();
  return new Date(targetStart.getTime() + offsetMs);
}

export function applyRemappedMatchState(match: ExternalMatch): ExternalMatch {
  if (!shouldRemapWorldCupDates()) return match;

  const matchTime = remapWorldCupDate(match.matchTime);
  const isFuture = matchTime.getTime() > Date.now();

  if (isFuture) {
    return {
      ...match,
      matchTime,
      status: "SCHEDULED",
      homeScore: null,
      awayScore: null,
      finishType: null,
      penaltyWinnerTeamApiId: null,
    };
  }

  return { ...match, matchTime };
}
