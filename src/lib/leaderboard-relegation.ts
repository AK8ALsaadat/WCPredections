import type { LeaderboardEntry } from "@/types";

export const RELEGATION_EXEMPT_USERNAME = "alsaadat";

function isExemptUsername(username: string) {
  return username.trim().toLocaleLowerCase("en-US") === RELEGATION_EXEMPT_USERNAME;
}

export function getRelegationStatus(
  entries: LeaderboardEntry[],
  enabled: boolean
) {
  if (!enabled || entries.length <= 3) {
    return {
      relegatedUserIds: new Set<string>(),
      exemptUserIds: new Set<string>(),
    };
  }

  const originalBottomThree = entries.slice(-3);
  const exemptEntry = originalBottomThree.find((entry) =>
    isExemptUsername(entry.username)
  );
  const relegatedEntries = entries
    .filter((entry) => !isExemptUsername(entry.username))
    .slice(-3);

  return {
    relegatedUserIds: new Set(relegatedEntries.map((entry) => entry.userId)),
    exemptUserIds: new Set(exemptEntry ? [exemptEntry.userId] : []),
  };
}
