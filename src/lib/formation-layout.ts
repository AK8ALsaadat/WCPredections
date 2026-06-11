import type { MatchPlayerView } from "@/services/match-players.service";

export type PitchSlot = {
  player: MatchPlayerView;
  x: number;
  y: number;
};

function shortName(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 10);
  return parts[parts.length - 1].slice(0, 12);
}

export function parseFormation(formation?: string | null): number[] {
  if (!formation) return [4, 3, 3];
  const parts = formation
    .split("-")
    .map((n) => parseInt(n.trim(), 10))
    .filter((n) => !Number.isNaN(n));
  return parts.length > 0 ? parts : [4, 3, 3];
}

function spreadRow(
  players: MatchPlayerView[],
  y: number,
  xMin = 12,
  xMax = 88
): PitchSlot[] {
  if (players.length === 0) return [];
  if (players.length === 1) {
    return [{ player: players[0], x: 50, y }];
  }
  const step = (xMax - xMin) / (players.length - 1);
  return players.map((player, index) => ({
    player,
    x: xMin + step * index,
    y,
  }));
}

function isGoalkeeper(player: MatchPlayerView) {
  const p = (player.position ?? "").toLowerCase();
  return p.includes("goal");
}

function sortStartersByRole(starters: MatchPlayerView[]) {
  const gk = starters.filter(isGoalkeeper);
  const outfield = starters.filter((p) => !isGoalkeeper(p));
  const gkPick = gk[0] ?? starters[0];
  const rest = gk.length > 0 ? outfield : starters.slice(1);
  return { gk: gkPick ? [gkPick] : [], outfield: gk.length > 0 ? rest : starters.slice(1) };
}

/** توزيع من grid الفعلي (مثل 1:1 للحارس من API-Football) */
export function layoutFromGrid(
  lineup: MatchPlayerView[],
  side: "home" | "away"
): PitchSlot[] | null {
  const starters = lineup.slice(0, 11);
  const withGrid = starters.filter((p) => p.grid);
  if (withGrid.length < 11) return null;

  const slots: PitchSlot[] = [];
  for (const player of starters) {
    if (!player.grid) return null;
    const [rowRaw, colRaw] = player.grid.split(":");
    const row = parseInt(rowRaw, 10);
    const col = parseInt(colRaw, 10);
    if (Number.isNaN(row) || Number.isNaN(col)) return null;

    const x = 10 + ((col - 1) / 4) * 80;
    const rowNorm = (row - 1) / 4;

    const y =
      side === "home"
        ? 10 + rowNorm * 28
        : 90 - rowNorm * 28;

    slots.push({ player, x, y });
  }

  return slots;
}

/** يوزع 11 لاعب حسب الخطة — الحارس عند خط المرمى */
export function layoutFormation(
  lineup: MatchPlayerView[],
  formation: string | null | undefined,
  side: "home" | "away"
): PitchSlot[] {
  const gridLayout = layoutFromGrid(lineup, side);
  if (gridLayout) return gridLayout;

  const starters = lineup.slice(0, 11);
  const { gk, outfield } = sortStartersByRole(starters);
  const rows = parseFormation(formation);

  let index = 0;
  const lines: MatchPlayerView[][] = [];
  for (const count of rows) {
    lines.push(outfield.slice(index, index + count));
    index += count;
  }

  while (index < outfield.length) {
    const last = lines[lines.length - 1];
    if (last) last.push(outfield[index++]);
    else break;
  }

  const lineCount = Math.max(lines.length, 1);
  const slots: PitchSlot[] = [];

  if (side === "home") {
    slots.push(...spreadRow(gk, 10));
    lines.forEach((players, lineIndex) => {
      const y = 18 + ((lineIndex + 1) / (lineCount + 1)) * 24;
      slots.push(...spreadRow(players, y));
    });
    return slots;
  }

  slots.push(...spreadRow(gk, 90));
  lines.forEach((players, lineIndex) => {
    const y = 82 - ((lineIndex + 1) / (lineCount + 1)) * 24;
    slots.push(...spreadRow(players, y));
  });
  return slots;
}

/** @deprecated استخدم layoutFormation */
export function layoutFormation433(
  lineup: MatchPlayerView[],
  side: "home" | "away"
): PitchSlot[] {
  return layoutFormation(lineup, "4-3-3", side);
}

export function getPlayerLabel(player: MatchPlayerView) {
  return shortName(player.name);
}
