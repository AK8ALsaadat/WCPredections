/** ملحق C — تعيين المركز الثالث لمواجهة متصدر المجموعة */
export type AnnexCRow = {
  qualifyingThirdGroups: string[];
  assignments: Record<string, string>;
};

function row(
  qualifying: string[],
  assignments: Record<string, string>
): AnnexCRow {
  return { qualifyingThirdGroups: qualifying, assignments };
}

const ANNEX_C_ROWS: AnnexCRow[] = [
  row(["E", "F", "G", "H", "I", "J", "K", "L"], { A: "E", B: "J", D: "I", E: "F", G: "H", I: "G", K: "L", L: "K" }),
  row(["D", "F", "G", "H", "I", "J", "K", "L"], { A: "H", B: "G", D: "I", E: "D", G: "J", I: "F", K: "L", L: "K" }),
  row(["D", "E", "G", "H", "I", "J", "K", "L"], { A: "E", B: "J", D: "I", E: "D", G: "H", I: "G", K: "L", L: "K" }),
  row(["D", "E", "F", "H", "I", "J", "K", "L"], { A: "E", B: "J", D: "I", E: "D", G: "H", I: "F", K: "L", L: "K" }),
  row(["D", "E", "F", "G", "I", "J", "K", "L"], { A: "E", B: "G", D: "I", E: "D", G: "J", I: "F", K: "L", L: "K" }),
  row(["D", "E", "F", "G", "H", "J", "K", "L"], { A: "E", B: "G", D: "J", E: "D", G: "H", I: "F", K: "L", L: "K" }),
  row(["D", "E", "F", "G", "H", "I", "K", "L"], { A: "E", B: "G", D: "I", E: "D", G: "H", I: "F", K: "L", L: "K" }),
  row(["D", "E", "F", "G", "H", "I", "J", "L"], { A: "E", B: "G", D: "J", E: "D", G: "H", I: "F", K: "L", L: "I" }),
  row(["D", "E", "F", "G", "H", "I", "J", "K"], { A: "E", B: "G", D: "J", E: "D", G: "H", I: "F", K: "K", L: "I" }),
  row(["C", "F", "G", "H", "I", "J", "K", "L"], { A: "H", B: "G", D: "I", E: "C", G: "J", I: "F", K: "L", L: "K" }),
  row(["C", "E", "G", "H", "I", "J", "K", "L"], { A: "E", B: "J", D: "I", E: "C", G: "H", I: "G", K: "L", L: "K" }),
  row(["C", "E", "F", "H", "I", "J", "K", "L"], { A: "E", B: "J", D: "I", E: "C", G: "H", I: "F", K: "L", L: "K" }),
  row(["C", "E", "F", "G", "I", "J", "K", "L"], { A: "E", B: "G", D: "I", E: "C", G: "J", I: "F", K: "L", L: "K" }),
  row(["C", "E", "F", "G", "H", "J", "K", "L"], { A: "E", B: "G", D: "J", E: "C", G: "H", I: "F", K: "L", L: "K" }),
  row(["C", "E", "F", "G", "H", "I", "K", "L"], { A: "E", B: "G", D: "I", E: "C", G: "H", I: "F", K: "L", L: "K" }),
  row(["C", "E", "F", "G", "H", "I", "J", "L"], { A: "E", B: "G", D: "J", E: "C", G: "H", I: "F", K: "L", L: "I" }),
  row(["C", "E", "F", "G", "H", "I", "J", "K"], { A: "E", B: "G", D: "J", E: "C", G: "H", I: "F", K: "K", L: "I" }),
  row(["B", "D", "E", "F", "G", "H", "I", "J"], { A: "E", B: "G", D: "J", E: "I", G: "H", I: "F", K: "B", L: "D" }),
  row(["A", "C", "D", "E", "F", "G", "H", "I"], { A: "G", B: "E", D: "I", E: "C", G: "H", I: "F", K: "A", L: "D" }),
];

export function getAnnexAssignments(
  qualifyingThirdGroups: string[]
): Record<string, string> | null {
  const key = [...qualifyingThirdGroups].sort().join(",");
  const found = ANNEX_C_ROWS.find(
    (r) => [...r.qualifyingThirdGroups].sort().join(",") === key
  );
  return found?.assignments ?? null;
}
