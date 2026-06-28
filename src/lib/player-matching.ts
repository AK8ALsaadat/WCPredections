export function normalizePlayerName(name: string): string {
  return name
    .replace(/[ıİ]/g, "i")
    .replace(/[łŁ]/g, "l")
    .replace(/[đĐ]/g, "d")
    .replace(/[øØ]/g, "o")
    .replace(/[æÆ]/g, "ae")
    .replace(/[œŒ]/g, "oe")
    .replace(/[’'\-\.]/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^0-9a-z\s]+/g, " ")
    .replace(/\bjr\b/g, "junior")
    .replace(/\b(?:filho|neto)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function nameParts(name: string): string[] {
  return normalizePlayerName(name).split(/\s+/).filter(Boolean);
}

export function lastNameKey(name: string): string {
  const parts = nameParts(name);
  return parts[parts.length - 1] ?? "";
}

export function firstNameKey(name: string): string {
  return nameParts(name)[0] ?? "";
}

const NAME_SUFFIXES = new Set(["jr", "junior", "filho", "neto"]);

export function playerNamesMatch(a: string, b: string): boolean {
  const normA = normalizePlayerName(a);
  const normB = normalizePlayerName(b);
  if (normA === normB) return true;

  const partsA = nameParts(a);
  const partsB = nameParts(b);
  if (partsA.length === 0 || partsB.length === 0) return false;

  const stripSuffixes = (parts: string[]): string[] =>
    parts.filter((part) => !NAME_SUFFIXES.has(part));

  const strippedA = stripSuffixes(partsA);
  const strippedB = stripSuffixes(partsB);
  if (strippedA.length > 0 && strippedB.length > 0 && strippedA.join(" ") === strippedB.join(" ")) {
    return true;
  }

  const lastA = partsA[partsA.length - 1];
  const lastB = partsB[partsB.length - 1];

  if (
    partsA.length > 1 &&
    partsB.length > 1 &&
    !NAME_SUFFIXES.has(lastA) &&
    !NAME_SUFFIXES.has(lastB) &&
    lastA !== lastB
  ) {
    return false;
  }

  if (lastA.length < 2 || lastB.length < 2) return false;

  const firstA = partsA[0];
  const firstB = partsB[0];
  if (firstA === firstB) return true;
  if (firstA.length === 1 && firstB.startsWith(firstA)) return true;
  if (firstB.length === 1 && firstA.startsWith(firstB)) return true;
  if (lastA === lastB && (firstA?.length === 1 || firstB?.length === 1)) return true;

  if (partsA.length === 1 && partsB.includes(lastA)) return true;
  if (partsB.length === 1 && partsA.includes(lastB)) return true;

  const shortA = partsA.slice(0, 2).join(" ");
  const shortB = partsB.slice(0, 2).join(" ");
  if (shortA === shortB) return true;

  const shorter = partsA.length <= partsB.length ? partsA : partsB;
  const longer = partsA.length <= partsB.length ? partsB : partsA;
  if (shorter.every((part) => longer.includes(part))) return true;

  return false;
}

type SquadPlayer = {
  id: string;
  name: string;
  apiPlayerId?: string | null;
};

export function resolvePlayerInSquad<T extends SquadPlayer>(
  squad: T[],
  options: { apiPlayerId?: string; playerName?: string }
): T | null {
  if (options.apiPlayerId) {
    const byApi = squad.find((p) => p.apiPlayerId === options.apiPlayerId);
    if (byApi) return byApi;
  }

  if (!options.playerName?.trim()) return null;

  const byFull = new Map(squad.map((p) => [normalizePlayerName(p.name), p]));
  const byLast = new Map<string, T[]>();
  for (const player of squad) {
    const key = lastNameKey(player.name);
    const list = byLast.get(key) ?? [];
    list.push(player);
    byLast.set(key, list);
  }

  const full = byFull.get(normalizePlayerName(options.playerName));
  if (full) return full;

  const lastMatches = byLast.get(lastNameKey(options.playerName));
  if (lastMatches?.length === 1) return lastMatches[0];

  const fuzzy = squad.filter((p) =>
    playerNamesMatch(p.name, options.playerName!)
  );
  if (fuzzy.length === 1) return fuzzy[0];

  return null;
}

type ScorerRow = {
  playerId: string;
  player: { name: string; teamId: string };
};

export function resolveScorerGoalsForPlayer(
  predictedPlayerId: string,
  predictedPlayer: { name: string; teamId: string },
  goalsByPlayerId: Map<string, number>,
  actualScorers: ScorerRow[]
): number | undefined {
  const direct = goalsByPlayerId.get(predictedPlayerId);
  if (direct != null && direct > 0) return direct;

  // Prefer same-team exact/approx name matches
  for (const scorer of actualScorers) {
    if (scorer.player.teamId !== predictedPlayer.teamId) continue;
    if (!playerNamesMatch(predictedPlayer.name, scorer.player.name)) continue;
    const goals = goalsByPlayerId.get(scorer.playerId);
    if (goals != null && goals > 0) return goals;
  }

  const predictedLastName = lastNameKey(predictedPlayer.name);
  const sameLastNameMatches = actualScorers.filter((scorer) => {
    const scorerLastName = lastNameKey(scorer.player.name);
    return Boolean(predictedLastName && scorerLastName && predictedLastName === scorerLastName);
  });
  if (sameLastNameMatches.length === 1) {
    const goals = goalsByPlayerId.get(sameLastNameMatches[0].playerId);
    if (goals != null && goals > 0) return goals;
  }

  // Fallback: if a single actual scorer in the match matches the predicted
  // player's name (after normalization), accept that scorer even if teamId differs.
  const nameMatches = actualScorers.filter((scorer) =>
    playerNamesMatch(predictedPlayer.name, scorer.player.name)
  );
  if (nameMatches.length === 1) {
    const goals = goalsByPlayerId.get(nameMatches[0].playerId);
    if (goals != null && goals > 0) return goals;
  }

  return goalsByPlayerId.get(predictedPlayerId);
}
