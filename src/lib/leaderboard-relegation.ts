import type { LeaderboardEntry } from "@/types";

export const RELEGATION_EXEMPT_USERNAME = "alsaadat";
export const MAIN_LEAGUE_SIZE = 8;
export const YELO_HIDDEN_USERNAMES = new Set(["ali", "mmg"]);

export function isRelegationExemptUsername(username: string) {
  return username.trim().toLocaleLowerCase("en-US") === RELEGATION_EXEMPT_USERNAME;
}

export function isYeloHiddenUsername(username: string) {
  return YELO_HIDDEN_USERNAMES.has(username.trim().toLocaleLowerCase("en-US"));
}

export function splitLeaderboardLeagues(
  entries: LeaderboardEntry[],
  enabled: boolean
) {
  if (!enabled) {
    return {
      mainEntries: entries,
      yeloEntries: [] as LeaderboardEntry[],
      exemptionAppliedUserIds: new Set<string>(),
    };
  }

  const mainSize = Math.min(MAIN_LEAGUE_SIZE, entries.length);
  let mainEntries = entries.slice(0, mainSize);
  let mainUserIds = new Set(mainEntries.map((entry) => entry.userId));
  const exemptionAppliedUserIds = new Set<string>();
  const exemptEntry = entries.find((entry) =>
    isRelegationExemptUsername(entry.username)
  );

  if (exemptEntry && !mainUserIds.has(exemptEntry.userId)) {
    const demotedEntry = [...mainEntries]
      .reverse()
      .find((entry) => !isRelegationExemptUsername(entry.username));

    if (demotedEntry) {
      mainEntries = mainEntries
        .filter((entry) => entry.userId !== demotedEntry.userId)
        .concat(exemptEntry)
        .sort((a, b) => a.rank - b.rank);
      mainUserIds = new Set(mainEntries.map((entry) => entry.userId));
      exemptionAppliedUserIds.add(exemptEntry.userId);
    }
  }

  const yeloEntries = entries.filter(
    (entry) =>
      !mainUserIds.has(entry.userId) && !isYeloHiddenUsername(entry.username)
  );

  return {
    mainEntries,
    yeloEntries,
    exemptionAppliedUserIds,
  };
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
    isRelegationExemptUsername(entry.username)
  );
  const relegatedEntries = entries
    .filter((entry) => !isRelegationExemptUsername(entry.username))
    .slice(-3);

  return {
    relegatedUserIds: new Set(relegatedEntries.map((entry) => entry.userId)),
    exemptUserIds: new Set(exemptEntry ? [exemptEntry.userId] : []),
  };
}
