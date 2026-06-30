type LineupPayloadLike = {
  homePlayers?: unknown;
  awayPlayers?: unknown;
};

function starterCount(players: unknown) {
  if (!Array.isArray(players)) return 0;
  return players.filter(
    (player) =>
      player != null &&
      typeof player === "object" &&
      "section" in player &&
      (player as { section?: unknown }).section === "lineup"
  ).length;
}

export function hasCompleteStartingLineups(lineup: unknown) {
  const payload = lineup as LineupPayloadLike | null | undefined;
  return (
    starterCount(payload?.homePlayers) >= 11 &&
    starterCount(payload?.awayPlayers) >= 11
  );
}
