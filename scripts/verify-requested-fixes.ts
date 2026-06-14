import { buildExpectedLineup } from "../src/lib/expected-lineup";
import {
  canAddScorer,
  getScorerBudgetStatus,
  maxGoalsForPlayer,
  pruneScorerPicksToBudget,
  type ScorerPicks,
} from "../src/lib/scorer-prediction";
import { playerNamesMatch } from "../src/lib/player-matching";
import { matchIdentityKey } from "../src/lib/team-identity";
import { layoutFormation } from "../src/lib/formation-layout";
import { mergeLineupData } from "../src/lib/lineup-state";
import {
  calculateScorerPredictionPoints,
  getPositionPointsMultiplier,
} from "../src/services/scoring.service";
import { mergeProbableBenchWithCurrentRoster } from "../src/services/match-players.service";

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

function compactAttackDistance(formation: "3-5-2" | "4-4-2") {
  const [defenders, midfielders] = formation.split("-").map(Number);
  const lineup = [
    {
      id: `${formation}-gk`,
      name: "GK",
      position: "Goalkeeper",
      section: "lineup" as const,
    },
    ...Array.from({ length: defenders }, (_, index) => ({
      id: `${formation}-d${index}`,
      name: `D${index}`,
      position: "Defender",
      section: "lineup" as const,
    })),
    ...Array.from({ length: midfielders }, (_, index) => ({
      id: `${formation}-m${index}`,
      name: `M${index}`,
      position: "Midfielder",
      section: "lineup" as const,
    })),
    ...Array.from({ length: 2 }, (_, index) => ({
      id: `${formation}-a${index}`,
      name: `A${index}`,
      position: "Forward",
      section: "lineup" as const,
    })),
  ];
  const attackers = layoutFormation(lineup, formation, "home")
    .filter((slot) => slot.player.position === "Forward")
    .sort((left, right) => left.x - right.x);
  return attackers[1].x - attackers[0].x;
}

check(
  "two strikers stay close in 3-5-2 and 4-4-2",
  compactAttackDistance("3-5-2") === 28 &&
    compactAttackDistance("4-4-2") === 28
);

const formation352Players = [
  { id: "352-gk", name: "GK", position: "Goalkeeper", section: "lineup" as const },
  ...Array.from({ length: 3 }, (_, index) => ({
    id: `352-d${index}`,
    name: `D${index}`,
    position: "Defender",
    section: "lineup" as const,
  })),
  ...Array.from({ length: 5 }, (_, index) => ({
    id: `352-m${index}`,
    name: `M${index}`,
    position: "Midfielder",
    section: "lineup" as const,
  })),
  ...Array.from({ length: 2 }, (_, index) => ({
    id: `352-a${index}`,
    name: `A${index}`,
    position: "Forward",
    section: "lineup" as const,
  })),
];
const backThree = layoutFormation(formation352Players, "3-5-2", "home")
  .filter((slot) => slot.player.position === "Defender")
  .sort((left, right) => left.x - right.x);
check(
  "three defenders stay compact in 3-5-2",
  backThree.length === 3 && backThree[2].x - backThree[0].x === 52
);
const grid352 = formation352Players.map((player, index) => {
  if (index === 0) return { ...player, grid: "1:1" };
  if (index <= 3) return { ...player, grid: `2:${index}` };
  if (index <= 8) return { ...player, grid: `3:${index - 3}` };
  return { ...player, grid: `4:${index - 8}` };
});
const gridBackThree = layoutFormation(grid352, "3-5-2", "home")
  .filter((slot) => slot.player.position === "Defender")
  .sort((left, right) => left.x - right.x);
check(
  "official 3-5-2 grid keeps the back three compact",
  gridBackThree.length === 3 &&
    gridBackThree[2].x - gridBackThree[0].x === 52
);
const formation343Players = formation352Players.map((player, index) => {
  if (index >= 4 && index <= 7) {
    return { ...player, id: `343-m${index}`, position: "Midfielder" };
  }
  if (index >= 8) {
    return { ...player, id: `343-a${index}`, position: "Forward" };
  }
  return { ...player, id: `343-${player.id}` };
});
const backThree343 = layoutFormation(formation343Players, "3-4-3", "home")
  .filter((slot) => slot.player.position === "Defender")
  .sort((left, right) => left.x - right.x);
check(
  "three defenders stay compact in 3-4-3",
  backThree343.length === 3 &&
    backThree343[2].x - backThree343[0].x === 52
);

const probableBench = mergeProbableBenchWithCurrentRoster(
  [{ name: "Unai Simon" }],
  [{ name: "Pedri" }],
  [{ name: "Pedri" }, { name: "Lamine Yamal" }]
);
check(
  "current squad completes probable bench with Lamine Yamal",
  probableBench.map((player) => player.name).join("|") ===
    "Pedri|Lamine Yamal"
);

const retainedLineup = mergeLineupData(
  {
    homePlayers: [
      {
        id: "yamal",
        name: "Lamine Yamal",
        position: "Forward",
        section: "lineup" as const,
      },
    ],
    awayPlayers: [],
  },
  {
    homePlayers: [
      {
        id: "pedri",
        name: "Pedri",
        position: "Midfielder",
        section: "lineup" as const,
      },
    ],
    awayPlayers: [],
  }
);
check(
  "lineup refresh keeps previously selectable players on the bench",
  retainedLineup.homePlayers.some(
    (player) => player.id === "yamal" && player.section === "bench"
  )
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
const highScoreHome = new Set(["h1", "h2", "h3"]);
const cappedHighScore = { h1: 3, h2: 2 };
const highScoreBudget = getScorerBudgetStatus(
  cappedHighScore,
  highScoreHome,
  oneAway,
  8,
  0
);
check(
  "large team score caps predicted scorer goals at five",
  highScoreBudget.homeTarget === 5 &&
    highScoreBudget.homeComplete &&
    maxGoalsForPlayer(
      cappedHighScore,
      "h1",
      highScoreHome,
      oneAway,
      8,
      0
    ) === 3 &&
    !canAddScorer(
      cappedHighScore,
      "h3",
      highScoreHome,
      oneAway,
      8,
      0
    ) &&
    pruneScorerPicksToBudget(
      { h1: 6 },
      highScoreHome,
      oneAway,
      8,
      0
    ).h1 === 5
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
