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

function spreadFormationRow(players: MatchPlayerView[], y: number) {
  const isCompactMidfield =
    players.length <= 3 &&
    players.every((player) =>
      (player.position ?? "").toLowerCase().includes("mid")
    );

  return isCompactMidfield
    ? spreadRow(players, y, 24, 76)
    : spreadRow(players, y, 10, 90);
}

function spreadLine(
  players: MatchPlayerView[],
  y: number,
  lineIndex: number,
  lineCount: number
) {
  const isTwoPlayerAttack = players.length === 2 && lineIndex === lineCount - 1;
  return isTwoPlayerAttack
    ? spreadRow(players, y, 36, 64)
    : spreadFormationRow(players, y);
}

function isGoalkeeper(player: MatchPlayerView) {
  const p = (player.position ?? "").toLowerCase();
  return p.includes("goal");
}

function positionRank(player: MatchPlayerView) {
  const position = (player.position ?? "").toLowerCase();
  if (
    position.includes("def") ||
    position.includes("back") ||
    position.includes("sweeper")
  ) return 0;
  if (position.includes("mid")) return 1;
  if (
    position.includes("attack") ||
    position.includes("forward") ||
    position.includes("offence") ||
    position.includes("offense") ||
    position.includes("striker") ||
    position.includes("wing")
  ) {
    return 2;
  }
  return 3;
}

function sortStartersByRole(starters: MatchPlayerView[]) {
  const gk = starters.filter(isGoalkeeper);
  const outfield = starters.filter((p) => !isGoalkeeper(p));
  const gkPick = gk[0] ?? starters[0];
  const rest = gk.length > 0 ? outfield : starters.slice(1);
  const sortedOutfield = rest
    .map((player, index) => ({ player, index }))
    .sort(
      (left, right) =>
        positionRank(left.player) - positionRank(right.player) ||
        left.index - right.index
    )
    .map(({ player }) => player);

  return { gk: gkPick ? [gkPick] : [], outfield: sortedOutfield };
}

/** توزيع من grid الفعلي (مثل 1:1 للحارس من API-Football) */
export function layoutFromGrid(
  lineup: MatchPlayerView[],
  side: "home" | "away"
): PitchSlot[] | null {
  const starters = lineup.slice(0, 11);
  const withGrid = starters.filter((p) => /^\d+:\d+$/.test(p.grid ?? ""));
  if (withGrid.length < 11) return null;

  const parsed = starters.map((player) => {
    const [rowRaw, colRaw] = player.grid!.split(":");
    return {
      player,
      row: parseInt(rowRaw, 10),
      col: parseInt(colRaw, 10),
    };
  });
  if (parsed.some(({ row, col }) => Number.isNaN(row) || Number.isNaN(col))) {
    return null;
  }

  const maxRow = Math.max(...parsed.map(({ row }) => row), 1);
  const columnsByRow = new Map<number, number>();
  for (const { row, col } of parsed) {
    columnsByRow.set(row, Math.max(columnsByRow.get(row) ?? 0, col));
  }

  const slots: PitchSlot[] = [];
  for (const { player, row, col } of parsed) {
    const columns = columnsByRow.get(row) ?? 1;
    const isTwoPlayerAttack = columns === 2 && row === maxRow;
    const xMin = isTwoPlayerAttack ? 36 : 10;
    const xMax = isTwoPlayerAttack ? 64 : 90;
    const x =
      columns === 1 ? 50 : xMin + ((col - 1) / (columns - 1)) * (xMax - xMin);
    const rowNorm = maxRow === 1 ? 0 : (row - 1) / (maxRow - 1);

    const y =
      side === "home"
        ? 8 + rowNorm * 36
        : 92 - rowNorm * 36;

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
  const starters = lineup.slice(0, 11);
  const gridSlots = layoutFromGrid(starters, side);
  if (gridSlots) return gridSlots;

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

  const slots: PitchSlot[] = [];
  const homeLineYs = lines.length === 3 ? [18, 31, 44] : null;
  const awayLineYs = lines.length === 3 ? [82, 69, 56] : null;

  if (side === "home") {
    slots.push(...spreadRow(gk, 5));
    lines.forEach((players, lineIndex) => {
      const y =
        homeLineYs?.[lineIndex] ??
        12 + ((lineIndex + 1) / (lines.length + 1)) * 36;
      slots.push(...spreadLine(players, y, lineIndex, lines.length));
    });
    return slots;
  }

  slots.push(...spreadRow(gk, 95));
  lines.forEach((players, lineIndex) => {
      const y =
        awayLineYs?.[lineIndex] ??
        88 - ((lineIndex + 1) / (lines.length + 1)) * 36;
    slots.push(...spreadLine(players, y, lineIndex, lines.length));
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
