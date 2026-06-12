type SquadPlayer = {
  id: number | string;
  name: string;
  position?: string | null;
  shirtNumber?: number | null;
};

type WithPosition = Pick<SquadPlayer, "id" | "position">;

export const EXPECTED_FORMATION = "4-3-3";

const EXPECTED_SLOTS = {
  gk: 1,
  def: 4,
  mid: 3,
  att: 3,
} as const;

type PositionBucket = keyof typeof EXPECTED_SLOTS | "other";

function getPositionBucket(position?: string | null): PositionBucket {
  const p = (position ?? "").toLowerCase();
  if (p.includes("goal")) return "gk";
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

/** تشكيلة متوقعة 4-3-3 من قائمة المنتخب */
export function buildExpectedLineup<T extends WithPosition>(squad: T[]) {
  const buckets: Record<PositionBucket, T[]> = {
    gk: [],
    def: [],
    mid: [],
    att: [],
    other: [],
  };

  for (const player of squad) {
    buckets[getPositionBucket(player.position)].push(player);
  }

  const lineup: T[] = [];
  const pick = (bucket: PositionBucket, count: number) => {
    const taken = buckets[bucket].splice(0, count);
    lineup.push(...taken);
  };

  pick("gk", EXPECTED_SLOTS.gk);
  pick("def", EXPECTED_SLOTS.def);
  pick("mid", EXPECTED_SLOTS.mid);
  pick("att", EXPECTED_SLOTS.att);

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
    formation: EXPECTED_FORMATION,
    lineup,
    bench,
  };
}
