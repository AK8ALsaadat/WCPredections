import { matchIdentityKey } from "@/lib/team-identity";

export type DisplayMatchForDedupe = {
  matchTime: string | Date;
  lineup?: unknown[];
  homeLineup?: unknown[];
  awayLineup?: unknown[];
  homeTeam: {
    name: string;
    shortName?: string | null;
    lineup?: unknown[];
  };
  awayTeam: {
    name: string;
    shortName?: string | null;
    lineup?: unknown[];
  };
  userPrediction?: unknown | null;
  userScorerPredictions?: unknown[];
};

function hasLineup(match: DisplayMatchForDedupe) {
  return Boolean(
    match.lineup?.length ||
      match.homeLineup?.length ||
      match.awayLineup?.length ||
      match.homeTeam.lineup?.length ||
      match.awayTeam.lineup?.length
  );
}

export function dedupeDisplayMatches<T extends DisplayMatchForDedupe>(
  rawMatches: T[]
): T[] {
  const groups = new Map<string, T[]>();
  for (const match of rawMatches) {
    const key = `${matchIdentityKey(
      match.homeTeam.name,
      match.awayTeam.name
    )}|${new Date(match.matchTime).getTime()}`;
    const arr = groups.get(key) ?? [];
    arr.push(match);
    groups.set(key, arr);
  }

  const result: T[] = [];
  for (const [, arr] of groups) {
    if (arr.length === 1) {
      result.push(arr[0]);
      continue;
    }

    const withLineup = arr.filter((match) => hasLineup(match));
    const candidates = withLineup.length > 0 ? withLineup : arr;

    candidates.sort((a, b) => {
      const scoreA =
        (a.userScorerPredictions?.length ?? 0) * 10 +
        (a.userPrediction ? 5 : 0) +
        (a.homeTeam.shortName?.length ?? 0) +
        (a.awayTeam.shortName?.length ?? 0);
      const scoreB =
        (b.userScorerPredictions?.length ?? 0) * 10 +
        (b.userPrediction ? 5 : 0) +
        (b.homeTeam.shortName?.length ?? 0) +
        (b.awayTeam.shortName?.length ?? 0);
      return scoreB - scoreA;
    });
    result.push(candidates[0]);
  }

  return result;
}
