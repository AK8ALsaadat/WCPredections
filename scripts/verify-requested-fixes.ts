import { buildExpectedLineup } from "../src/lib/expected-lineup";
import {
  maxGoalsForPlayer,
  type ScorerPicks,
} from "../src/lib/scorer-prediction";
import { playerNamesMatch } from "../src/lib/player-matching";
import { matchIdentityKey } from "../src/lib/team-identity";
import { layoutFormation } from "../src/lib/formation-layout";
import {
  calculateScorerPredictionPoints,
  getPositionPointsMultiplier,
} from "../src/services/scoring.service";

let failures = 0;

function check(name: string, condition: boolean) {
  if (!condition) {
    failures++;
    console.error(`FAIL: ${name}`);
    return;
  }
  console.log(`PASS: ${name}`);
}

check(
  "Yildiz name variants match",
  playerNamesMatch("Kenan Yıldız", "K. Yildiz")
);
check(
  "Vinicius Junior name variants match",
  playerNamesMatch("Vinícius Jr.", "Vinicius Junior")
);
check(
  "Turkey and Turkiye share one match identity",
  matchIdentityKey("Turkey", "Australia") ===
    matchIdentityKey("Türkiye", "Australia")
);

const squad = [
  { id: 1, name: "GK", position: "Goalkeeper" },
  ...Array.from({ length: 4 }, (_, index) => ({
    id: index + 2,
    name: `D${index}`,
    position: "Defender",
  })),
  ...Array.from({ length: 5 }, (_, index) => ({
    id: index + 6,
    name: `M${index}`,
    position: "Midfielder",
  })),
  ...Array.from({ length: 3 }, (_, index) => ({
    id: index + 11,
    name: `A${index}`,
    position: "Attacker",
  })),
];
const expected352 = buildExpectedLineup(squad, "3-5-2");
check(
  "expected lineup preserves 3-5-2",
  expected352.formation === "3-5-2" && expected352.lineup.length === 11
);

const fiveHome = new Set(["h1", "h2", "h3", "h4", "h5"]);
const oneAway = new Set(["a1"]);
const fiveScorers: ScorerPicks = {
  h1: 1,
  h2: 1,
  h3: 1,
  h4: 1,
  h5: 1,
};
check(
  "five scorers for five goals cannot be increased",
  maxGoalsForPlayer(fiveScorers, "h1", fiveHome, oneAway, 5, 1) === 1
);
check(
  "one away scorer cannot exceed the away score",
  maxGoalsForPlayer(
    { h1: 3, h2: 1, h3: 1, a1: 1 },
    "a1",
    new Set(["h1", "h2", "h3"]),
    oneAway,
    5,
    1
  ) === 1
);

check(
  "general player position controls scorer points",
  getPositionPointsMultiplier("Midfielder") === 2 &&
    getPositionPointsMultiplier("Defender") === 3 &&
    getPositionPointsMultiplier("Winger") === 1 &&
    calculateScorerPredictionPoints(1, 1, "Defender") === 3
);

const espnOrdinalGrid = [
  { id: "gk", name: "GK", position: "Goalkeeper", section: "lineup" as const, grid: "1" },
  ...Array.from({ length: 4 }, (_, index) => ({
    id: `d${index}`,
    name: `D${index}`,
    position:
      index === 0
        ? "Left Back"
        : index === 3
          ? "Right Back"
          : "Center Defender",
    section: "lineup" as const,
    grid: String(index + 2),
  })),
  ...Array.from({ length: 3 }, (_, index) => ({
    id: `m${index}`,
    name: `M${index}`,
    position: "Midfielder",
    section: "lineup" as const,
    grid: String(index + 6),
  })),
  ...Array.from({ length: 3 }, (_, index) => ({
    id: `a${index}`,
    name: `A${index}`,
    position: "Forward",
    section: "lineup" as const,
    grid: String(index + 9),
  })),
];
const ordinalSlots = layoutFormation(espnOrdinalGrid, null, "home");
check(
  "ESPN ordinal formationPlace does not collapse players into one line",
  new Set(ordinalSlots.map((slot) => slot.x)).size > 3 &&
    new Set(ordinalSlots.map((slot) => slot.y)).size === 4 &&
    ordinalSlots.find((slot) => slot.player.id === "d0")?.y === 18 &&
    ordinalSlots.find((slot) => slot.player.id === "d3")?.y === 18
);

process.exit(failures === 0 ? 0 : 1);
