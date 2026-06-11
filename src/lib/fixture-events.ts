export type ParsedFixtureEvent = {
  type: string;
  detail: string;
  playerApiId: string | null;
};

/** تجميع أهداف كل لاعب من أحداث المباراة — يدعم إلغاء الهدف بالـ VAR */
export function aggregateGoalsFromEvents(
  events: ParsedFixtureEvent[]
): Map<string, number> {
  const goals = new Map<string, number>();

  for (const event of events) {
    const playerApiId = event.playerApiId;
    if (!playerApiId) continue;

    const detail = event.detail.trim().toLowerCase();

    if (event.type === "Goal") {
      if (detail.includes("missed penalty")) continue;
      if (detail.includes("cancelled") || detail.includes("disallowed")) continue;

      goals.set(playerApiId, (goals.get(playerApiId) ?? 0) + 1);
      continue;
    }

    if (event.type === "Var") {
      if (!detail.includes("cancelled") && !detail.includes("disallowed")) {
        continue;
      }

      const current = goals.get(playerApiId) ?? 0;
      if (current <= 1) {
        goals.delete(playerApiId);
      } else {
        goals.set(playerApiId, current - 1);
      }
    }
  }

  return goals;
}

export function goalsMapToList(map: Map<string, number>) {
  return Array.from(map.entries()).map(([playerApiId, goals]) => ({
    playerApiId,
    goals,
  }));
}
