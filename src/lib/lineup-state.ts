import type { MatchPlayerView } from "@/services/match-players.service";

function mergeLineupPlayers(
  current: MatchPlayerView[],
  previous: MatchPlayerView[]
) {
  const currentIds = new Set(current.map((player) => player.id));
  return [
    ...current,
    ...previous
      .filter((player) => !currentIds.has(player.id))
      .map((player) => ({ ...player, section: "bench" as const, grid: null })),
  ];
}

export function mergeLineupData<
  T extends {
    homePlayers: MatchPlayerView[];
    awayPlayers: MatchPlayerView[];
  },
>(previous: T | null, current: T): T {
  if (!previous) return current;
  return {
    ...current,
    homePlayers: mergeLineupPlayers(
      current.homePlayers,
      previous.homePlayers
    ),
    awayPlayers: mergeLineupPlayers(
      current.awayPlayers,
      previous.awayPlayers
    ),
  };
}
