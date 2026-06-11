export type PlayerPositionGroup = {
  id: string;
  name: string;
  position?: string | null;
  shirtNumber?: number | null;
};

function groupPosition(position?: string | null): string {
  if (!position) return "أخرى";
  const p = position.toLowerCase();
  if (p.includes("goal")) return "حراس";
  if (p.includes("back") || p.includes("defen")) return "دفاع";
  if (p.includes("mid")) return "وسط";
  if (p.includes("wing") || p.includes("forward") || p.includes("offence")) {
    return "هجوم";
  }
  return "أخرى";
}

export function groupPlayersByPosition<T extends PlayerPositionGroup>(
  players: T[]
): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const player of players) {
    const key = groupPosition(player.position);
    if (!groups[key]) groups[key] = [];
    groups[key].push(player);
  }
  return groups;
}
