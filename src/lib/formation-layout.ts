import type { MatchPlayerView } from "@/services/match-players.service";
import { isGoalkeeperPosition } from "@/lib/goalkeeper";

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
  lineCount: number,
  formationRows: number[]
) {
  const isTwoPlayerAttack = players.length === 2 && lineIndex === lineCount - 1;
  const isCompactBackThree =
    players.length === 3 &&
    lineIndex === 0 &&
    formationRows[0] === 3;
  if (isTwoPlayerAttack) return spreadRow(players, y, 36, 64);
  if (isCompactBackThree) return spreadRow(players, y, 24, 76);
  return spreadFormationRow(players, y);
}

function spreadOrdinalLine(
  players: MatchPlayerView[],
  y: number,
  lineIndex: number,
  lineCount: number,
  formationRows: number[]
) {
  const isTwoPlayerAttack = players.length === 2 && lineIndex === lineCount - 1;
  const isCompactBackThree =
    players.length === 3 &&
    lineIndex === 0 &&
    formationRows[0] === 3;
  if (isTwoPlayerAttack) return spreadRow(players, y, 36, 64);
  if (isCompactBackThree) return spreadRow(players, y, 24, 76);
  return spreadRow(players, y, 10, 90);
}

function isGoalkeeper(player: MatchPlayerView) {
  return isGoalkeeperPosition(player.position);
}

function positionRank(player: MatchPlayerView) {
  const position = (player.position ?? "").toLowerCase();
  const gridPlace = /^\d+$/.test(player.grid ?? "")
    ? Number.parseInt(player.grid!, 10)
    : null;
  const isDefender =
    /^(d|def)$/.test(position) ||
    /\b(cb|lb|rb|lwb|rwb)\b/.test(position) ||
    position.includes("def") ||
    position.includes("back") ||
    position.includes("sweeper");

  if (isDefender) {
    const isFullback =
      (position.includes("back") ||
        position.includes("left") ||
        position.includes("right")) &&
      !position.includes("center") &&
      !position.includes("central");
    if (isFullback || gridPlace === 2 || gridPlace === 3) return 0.5;
    return 0;
  }
  if (/^(m|mid)$/.test(position) || /\b(cm|dm|am|lm|rm)\b/.test(position)) return 2;
  if (position.includes("defensive") && position.includes("mid")) return 1;
  if (position.includes("attack") && position.includes("mid")) return 3;
  if (position.includes("mid")) return 2;
  if (
    /^(f|for|att)$/.test(position) ||
    /\b(fw|st|cf|lw|rw)\b/.test(position) ||
    position.includes("attack") ||
    position.includes("forward") ||
    position.includes("offence") ||
    position.includes("offense") ||
    position.includes("striker") ||
    position.includes("wing")
  ) {
    return 4;
  }
  return 5;
}

function horizontalRoleRank(player: MatchPlayerView) {
  const position = (player.position ?? "").toLowerCase();
  const isLeft = position.includes("left");
  const isRight = position.includes("right");
  const isCenter =
    position.includes("center") || position.includes("central");

  if (isLeft) return isCenter ? 1 : 0;
  if (isRight) return isCenter ? 3 : 4;
  if (isCenter) return 2;

  // ESPN formationPlace values are tactical roles rather than coordinates.
  // Use them only to order players within a formation row.
  if (/^\d+$/.test(player.grid ?? "")) {
    const place = Number.parseInt(player.grid!, 10);
    if (place === 3 || place === 8 || place === 11) return 0;
    if (place === 6) return 1;
    if (place === 1 || place === 4 || place === 9) return 2;
    if (place === 5) return 3;
    if (place === 2 || place === 7 || place === 10) return 4;
  }

  return 2;
}

function sortFormationLine(
  players: MatchPlayerView[],
  side: "home" | "away"
) {
  return players
    .map((player, index) => ({
      player,
      index,
      rank: horizontalRoleRank(player),
    }))
    .sort((left, right) => {
      const rankDifference =
        side === "home"
          ? right.rank - left.rank
          : left.rank - right.rank;
      return rankDifference || left.index - right.index;
    })
    .map(({ player }) => player);
}

function horizontalRank(player: MatchPlayerView) {
  const position = (player.position ?? "").toLowerCase();
  if (/^(lwb|lb|lw)$/.test(position)) return 0;
  if (/^(rwb|rb|rw)$/.test(position)) return 2;
  if (/\bleft\b|\blb\b|\blwb\b|\blw\b/.test(position)) return 0;
  if (/\bright\b|\brb\b|\brwb\b|\brw\b/.test(position)) return 2;
  return 1;
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
        horizontalRank(left.player) - horizontalRank(right.player) ||
        left.index - right.index
    )
    .map(({ player }) => player);

  return { gk: gkPick ? [gkPick] : [], outfield: sortedOutfield };
}

function ordinalGridPlace(player: MatchPlayerView) {
  return /^\d+$/.test(player.grid ?? "")
    ? Number.parseInt(player.grid!, 10)
    : null;
}

function layoutFromOrdinalGrid(
  lineup: MatchPlayerView[],
  formation: string | null | undefined,
  side: "home" | "away"
): PitchSlot[] | null {
  const starters = lineup.slice(0, 11);
  const withOrdinal = starters.filter(
    (player) => ordinalGridPlace(player) != null
  );
  if (withOrdinal.length < 10) return null;

  const rows = parseFormation(formation);
  const goalkeeper =
    starters.find((player) => ordinalGridPlace(player) === 1) ??
    starters.find(isGoalkeeper);
  if (!goalkeeper) return null;

  const outfield = starters
    .filter((player) => player.id !== goalkeeper.id)
    .map((player, index) => ({
      player,
      index,
      place: ordinalGridPlace(player),
    }))
    .sort((left, right) => {
      if (left.place != null && right.place != null) {
        return left.place - right.place;
      }
      if (left.place != null) return -1;
      if (right.place != null) return 1;
      return (
        positionRank(left.player) - positionRank(right.player) ||
        left.index - right.index
      );
    })
    .map(({ player }) => player);

  let index = 0;
  const lines = rows.map((count) => {
    const line = outfield.slice(index, index + count);
    index += count;
    return line;
  });

  while (index < outfield.length) {
    lines[lines.length - 1]?.push(outfield[index++]);
  }

  const homeLineYs = lines.length === 3 ? [18, 31, 44] : null;
  const awayLineYs = lines.length === 3 ? [82, 69, 56] : null;
  const slots: PitchSlot[] = [
    ...spreadRow([goalkeeper], side === "home" ? 7 : 93),
  ];

  lines.forEach((players, lineIndex) => {
    const y =
      side === "home"
        ? homeLineYs?.[lineIndex] ??
          12 + ((lineIndex + 1) / (lines.length + 1)) * 36
        : awayLineYs?.[lineIndex] ??
          88 - ((lineIndex + 1) / (lines.length + 1)) * 36;
    slots.push(
      ...spreadOrdinalLine(
        sortFormationLine(players, side),
        y,
        lineIndex,
        lines.length,
        rows
      )
    );
  });

  return slots;
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
  const orderedRows = [...columnsByRow.entries()].sort(
    ([left], [right]) => left - right
  );
  const hasBackThreeGrid =
    orderedRows[0]?.[1] === 1 && orderedRows[1]?.[1] === 3;
  const defenseRow = orderedRows[1]?.[0];

  const slots: PitchSlot[] = [];
  for (const { player, row, col } of parsed) {
    const columns = columnsByRow.get(row) ?? 1;
    const isTwoPlayerAttack = columns === 2 && row === maxRow;
    const isCompactBackThree =
      hasBackThreeGrid && columns === 3 && row === defenseRow;
    const xMin = isTwoPlayerAttack ? 36 : isCompactBackThree ? 24 : 10;
    const xMax = isTwoPlayerAttack ? 64 : isCompactBackThree ? 76 : 90;
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
  const ordinalSlots = layoutFromOrdinalGrid(starters, formation, side);
  if (ordinalSlots) return ordinalSlots;

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
    slots.push(...spreadRow(gk, 7));
    lines.forEach((players, lineIndex) => {
      const y =
        homeLineYs?.[lineIndex] ??
        12 + ((lineIndex + 1) / (lines.length + 1)) * 36;
      slots.push(
        ...spreadLine(
          sortFormationLine(players, side),
          y,
          lineIndex,
          lines.length,
          rows
        )
      );
    });
    return slots;
  }

  slots.push(...spreadRow(gk, 93));
  lines.forEach((players, lineIndex) => {
      const y =
        awayLineYs?.[lineIndex] ??
        88 - ((lineIndex + 1) / (lines.length + 1)) * 36;
    slots.push(
      ...spreadLine(
        sortFormationLine(players, side),
        y,
        lineIndex,
        lines.length,
        rows
      )
    );
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
