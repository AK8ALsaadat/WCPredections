export type BracketSlot =
  | { type: "WINNER"; group: string }
  | { type: "RUNNER_UP"; group: string }
  | { type: "THIRD_FOR_WINNER"; winnerGroup: string }
  | { type: "WINNER_OF"; matchNo: number }
  | { type: "LOSER_OF"; matchNo: number };

export type BracketMatchDef = {
  matchNo: number;
  home: BracketSlot;
  away: BracketSlot;
};

/** ترتيب مباريات API يطابق جدول FIFA (M73–M104) */
export const WC_2026_BRACKET: Record<string, BracketMatchDef> = {
  "537417": { matchNo: 73, home: { type: "RUNNER_UP", group: "A" }, away: { type: "RUNNER_UP", group: "B" } },
  "537423": { matchNo: 76, home: { type: "WINNER", group: "C" }, away: { type: "RUNNER_UP", group: "F" } },
  "537415": { matchNo: 74, home: { type: "WINNER", group: "E" }, away: { type: "THIRD_FOR_WINNER", winnerGroup: "E" } },
  "537418": { matchNo: 75, home: { type: "WINNER", group: "F" }, away: { type: "RUNNER_UP", group: "C" } },
  "537424": { matchNo: 78, home: { type: "RUNNER_UP", group: "E" }, away: { type: "RUNNER_UP", group: "I" } },
  "537416": { matchNo: 77, home: { type: "WINNER", group: "I" }, away: { type: "THIRD_FOR_WINNER", winnerGroup: "I" } },
  "537425": { matchNo: 79, home: { type: "WINNER", group: "A" }, away: { type: "THIRD_FOR_WINNER", winnerGroup: "A" } },
  "537426": { matchNo: 80, home: { type: "WINNER", group: "L" }, away: { type: "THIRD_FOR_WINNER", winnerGroup: "L" } },
  "537422": { matchNo: 82, home: { type: "WINNER", group: "G" }, away: { type: "THIRD_FOR_WINNER", winnerGroup: "G" } },
  "537421": { matchNo: 81, home: { type: "WINNER", group: "D" }, away: { type: "THIRD_FOR_WINNER", winnerGroup: "D" } },
  "537420": { matchNo: 84, home: { type: "WINNER", group: "H" }, away: { type: "RUNNER_UP", group: "J" } },
  "537419": { matchNo: 83, home: { type: "RUNNER_UP", group: "K" }, away: { type: "RUNNER_UP", group: "L" } },
  "537429": { matchNo: 85, home: { type: "WINNER", group: "B" }, away: { type: "THIRD_FOR_WINNER", winnerGroup: "B" } },
  "537428": { matchNo: 86, home: { type: "WINNER", group: "J" }, away: { type: "RUNNER_UP", group: "H" } },
  "537427": { matchNo: 88, home: { type: "RUNNER_UP", group: "D" }, away: { type: "RUNNER_UP", group: "G" } },
  "537430": { matchNo: 87, home: { type: "WINNER", group: "K" }, away: { type: "THIRD_FOR_WINNER", winnerGroup: "K" } },

  "537376": { matchNo: 89, home: { type: "WINNER_OF", matchNo: 74 }, away: { type: "WINNER_OF", matchNo: 77 } },
  "537375": { matchNo: 90, home: { type: "WINNER_OF", matchNo: 73 }, away: { type: "WINNER_OF", matchNo: 75 } },
  "537377": { matchNo: 91, home: { type: "WINNER_OF", matchNo: 76 }, away: { type: "WINNER_OF", matchNo: 78 } },
  "537378": { matchNo: 92, home: { type: "WINNER_OF", matchNo: 79 }, away: { type: "WINNER_OF", matchNo: 80 } },
  "537379": { matchNo: 93, home: { type: "WINNER_OF", matchNo: 83 }, away: { type: "WINNER_OF", matchNo: 84 } },
  "537380": { matchNo: 94, home: { type: "WINNER_OF", matchNo: 81 }, away: { type: "WINNER_OF", matchNo: 82 } },
  "537381": { matchNo: 95, home: { type: "WINNER_OF", matchNo: 86 }, away: { type: "WINNER_OF", matchNo: 88 } },
  "537382": { matchNo: 96, home: { type: "WINNER_OF", matchNo: 85 }, away: { type: "WINNER_OF", matchNo: 87 } },

  "537383": { matchNo: 97, home: { type: "WINNER_OF", matchNo: 89 }, away: { type: "WINNER_OF", matchNo: 90 } },
  "537384": { matchNo: 98, home: { type: "WINNER_OF", matchNo: 93 }, away: { type: "WINNER_OF", matchNo: 94 } },
  "537385": { matchNo: 99, home: { type: "WINNER_OF", matchNo: 91 }, away: { type: "WINNER_OF", matchNo: 92 } },
  "537386": { matchNo: 100, home: { type: "WINNER_OF", matchNo: 95 }, away: { type: "WINNER_OF", matchNo: 96 } },

  "537387": { matchNo: 101, home: { type: "WINNER_OF", matchNo: 97 }, away: { type: "WINNER_OF", matchNo: 98 } },
  "537388": { matchNo: 102, home: { type: "WINNER_OF", matchNo: 99 }, away: { type: "WINNER_OF", matchNo: 100 } },

  "537389": { matchNo: 103, home: { type: "LOSER_OF", matchNo: 101 }, away: { type: "LOSER_OF", matchNo: 102 } },
  "537390": { matchNo: 104, home: { type: "WINNER_OF", matchNo: 101 }, away: { type: "WINNER_OF", matchNo: 102 } },
};

export function getBracketByApiMatchId(apiMatchId: string | null | undefined) {
  if (!apiMatchId) return null;
  return WC_2026_BRACKET[apiMatchId] ?? null;
}

export function getBracketRoundLabel(matchNo: number): string | null {
  if (matchNo >= 73 && matchNo <= 88) return "Round of 16";
  if (matchNo >= 89 && matchNo <= 96) return "Quarter-finals";
  if (matchNo >= 97 && matchNo <= 100) return "Semi-finals";
  if (matchNo === 101) return "Third-place match";
  if (matchNo === 102 || matchNo === 103 || matchNo === 104) return "Final";
  return null;
}
