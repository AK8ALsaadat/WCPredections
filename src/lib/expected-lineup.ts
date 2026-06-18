import { isGoalkeeperPosition } from "@/lib/goalkeeper";

type SquadPlayer = {
  id: number;
  name: string;
  position?: string | null;
  shirtNumber?: number | null;
};

export const EXPECTED_FORMATION = "4-3-3";

type PositionBucket = "gk" | "def" | "mid" | "att" | "other";

function getPositionBucket(position?: string | null): PositionBucket {
  const p = (position ?? "").toLowerCase();
  if (isGoalkeeperPosition(p)) return "gk";
  if (p.includes("defen") || p.includes("back")) return "def";
  if (p.includes("mid")) return "mid";
  if (
    p.includes("offence") ||
    p.includes("forward") ||
    p.includes("wing") ||
    p.includes("striker")
  ) {
    return "att";
  }
  return "other";
}

/** تشكيلة متوقعة من قائمة المنتخب مع الحفاظ على آخر خطة معروفة. */
function formationSlots(formation?: string | null) {
  const rows = (formation ?? EXPECTED_FORMATION)
    .split("-")
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value > 0);
  const valid =
    rows.length >= 2 &&
    rows.reduce((sum, value) => sum + value, 0) === 10;
  const selected = valid ? rows : [4, 3, 3];

  return {
    formation: selected.join("-"),
    def: selected[0],
    mid: selected.slice(1, -1).reduce((sum, value) => sum + value, 0),
    att: selected[selected.length - 1],
  };
}

export function buildExpectedLineup(
  squad: SquadPlayer[],
  formation?: string | null
) {
  const slots = formationSlots(formation);
  const buckets: Record<PositionBucket, SquadPlayer[]> = {
    gk: [],
    def: [],
    mid: [],
    att: [],
    other: [],
  };

  for (const player of squad) {
    buckets[getPositionBucket(player.position)].push(player);
  }

  const lineup: SquadPlayer[] = [];
  const pick = (bucket: PositionBucket, count: number) => {
    const taken = buckets[bucket].splice(0, count);
    lineup.push(...taken);
  };

  pick("gk", 1);
  pick("def", slots.def);
  pick("mid", slots.mid);
  pick("att", slots.att);

  if (lineup.length < 11) {
    const remaining = [
      ...buckets.def,
      ...buckets.mid,
      ...buckets.att,
      ...buckets.other,
    ];
    for (const player of remaining) {
      if (lineup.length >= 11) break;
      lineup.push(player);
    }
  }

  const usedIds = new Set(lineup.map((p) => p.id));
  const bench = squad.filter((p) => !usedIds.has(p.id));

  return {
    formation: slots.formation,
    lineup,
    bench,
  };
}
