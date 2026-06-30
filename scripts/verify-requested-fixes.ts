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
import { hasCompleteStartingLineups } from "../src/lib/lineup-completeness";
import { dedupeDisplayMatches } from "../src/lib/match-list-dedupe";
import { buildMatchHistoryEntries } from "../src/lib/profile-history";
import { isPredictionAllowed } from "../src/lib/utils";
import { fullPredictionBundleSchema } from "../src/lib/validations";
import {
  calculateScorerPredictionPoints,
  getPositionPointsMultiplier,
} from "../src/services/scoring.service";
import {
  mergeProbableBenchWithCurrentRoster,
  mergeTeamViewWithCurrentRoster,
} from "../src/services/match-players.service";
import { getMaxDoublesForUsageScope } from "../src/services/usage-round.service";
import { resolveActualFinishType } from "../src/services/football-api";

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
  "players sharing only a surname stay distinct",
  !playerNamesMatch("Enner Valencia", "Anthony Valencia")
);
check(
  "Turkey and Turkiye share one match identity",
  matchIdentityKey("Turkey", "Australia") ===
    matchIdentityKey("Türkiye", "Australia")
);
check(
  "encoded Curacao and Cape Verde aliases share team identities",
  matchIdentityKey("CuraÃ§ao", "Cape Verde Islands") ===
    matchIdentityKey("Curacao", "Cape Verde")
);

const sourceMatchBase = {
  apiId: "source-match",
  homeTeamApiId: "home",
  awayTeamApiId: "away",
  matchTime: new Date("2026-07-01T20:00:00Z"),
  status: "FINISHED" as const,
  isKnockout: true,
  homeScore: 2,
  awayScore: 1,
};
check(
  "finished knockout source match defaults missing finish type to 90 minutes",
  resolveActualFinishType({ ...sourceMatchBase, finishType: null }) ===
    "NINETY_MINUTES"
);
check(
  "source match preserves extra time and penalties finish types",
  resolveActualFinishType({
    ...sourceMatchBase,
    finishType: "EXTRA_TIME",
  }) === "EXTRA_TIME" &&
    resolveActualFinishType({
      ...sourceMatchBase,
      finishType: "PENALTIES",
    }) === "PENALTIES"
);
check(
  "prediction validation rejects penalties without a drawn score",
  !fullPredictionBundleSchema.safeParse({
    matchId: "match-1",
    predHome: 2,
    predAway: 1,
    isDouble: false,
    predictedFinishType: "PENALTIES",
    predictedPenaltyWinnerTeamId: "home-team",
    picks: [],
    boldPlayerId: null,
    octopusPlayerId: null,
  }).success
);
check(
  "prediction validation allows penalties with a drawn score and winner",
  fullPredictionBundleSchema.safeParse({
    matchId: "match-1",
    predHome: 1,
    predAway: 1,
    isDouble: false,
    predictedFinishType: "PENALTIES",
    predictedPenaltyWinnerTeamId: "home-team",
    picks: [],
    boldPlayerId: null,
    octopusPlayerId: null,
  }).success
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
const mixedRoleExpected = buildExpectedLineup(
  [
    { id: 1, name: "GK", position: "Goalkeeper" },
    { id: 2, name: "CB1", position: "Center Defender" },
    { id: 3, name: "CB2", position: "Center Defender" },
    { id: 4, name: "LB", position: "Left Back" },
    { id: 5, name: "RB", position: "Right Back" },
    { id: 6, name: "DM", position: "Defensive Midfielder" },
    { id: 7, name: "CM", position: "Center Midfielder" },
    { id: 8, name: "AM", position: "Attacking Midfielder" },
    { id: 9, name: "LW", position: "Left Winger" },
    { id: 10, name: "ST", position: "Striker" },
    { id: 11, name: "RW", position: "Right Winger" },
  ],
  "4-3-3"
);
check(
  "expected lineup keeps defensive and attacking midfielders in midfield",
  mixedRoleExpected.lineup.slice(5, 8).map((player) => player.name).join("|") ===
    "DM|CM|AM"
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
const spainBackFour = layoutFormation(
  [
    {
      id: "unai",
      name: "Unai Simon",
      position: "Goalkeeper",
      section: "lineup" as const,
      grid: "1",
    },
    {
      id: "laporte",
      name: "Aymeric Laporte",
      position: "Center Left Defender",
      section: "lineup" as const,
      grid: "6",
    },
    {
      id: "cubarsi",
      name: "Pau Cubarsi",
      position: "Center Right Defender",
      section: "lineup" as const,
      grid: "5",
    },
    {
      id: "cucurella",
      name: "Marc Cucurella",
      position: "Left Back",
      section: "lineup" as const,
      grid: "3",
    },
    {
      id: "llorente",
      name: "Marcos Llorente",
      position: "Right Back",
      section: "lineup" as const,
      grid: "2",
    },
    ...Array.from({ length: 3 }, (_, index) => ({
      id: `spain-m${index}`,
      name: `M${index}`,
      position: "Midfielder",
      section: "lineup" as const,
    })),
    ...Array.from({ length: 3 }, (_, index) => ({
      id: `spain-a${index}`,
      name: `A${index}`,
      position: "Forward",
      section: "lineup" as const,
    })),
  ],
  "4-3-3",
  "home"
);
const spainDefenderXs = new Map(
  spainBackFour
    .filter((slot) =>
      ["laporte", "cubarsi", "cucurella", "llorente"].includes(
        slot.player.id
      )
    )
    .map((slot) => [slot.player.id, slot.x])
);
check(
  "fullbacks stay outside Spain center backs",
  spainDefenderXs.get("llorente") === 10 &&
    spainDefenderXs.get("cubarsi")! > 10 &&
    spainDefenderXs.get("laporte")! < 90 &&
    spainDefenderXs.get("cucurella") === 90
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
const wingback343 = layoutFormation(
  [
    {
      id: "343-gk",
      name: "GK",
      position: "Goalkeeper",
      section: "lineup" as const,
    },
    {
      id: "343-lwb",
      name: "LWB",
      position: "Left Back",
      section: "lineup" as const,
      grid: "3",
    },
    {
      id: "343-rcb",
      name: "RCB",
      position: "Center Right Defender",
      section: "lineup" as const,
      grid: "5",
    },
    {
      id: "343-rwb",
      name: "RWB",
      position: "Right Back",
      section: "lineup" as const,
      grid: "2",
    },
    {
      id: "343-cb",
      name: "CB",
      position: "Center Defender",
      section: "lineup" as const,
      grid: "4",
    },
    {
      id: "343-lcb",
      name: "LCB",
      position: "Center Left Defender",
      section: "lineup" as const,
      grid: "6",
    },
    ...Array.from({ length: 2 }, (_, index) => ({
      id: `343-mid${index}`,
      name: `M${index}`,
      position: "Center Midfielder",
      section: "lineup" as const,
    })),
    ...Array.from({ length: 3 }, (_, index) => ({
      id: `343-forward${index}`,
      name: `F${index}`,
      position: "Forward",
      section: "lineup" as const,
    })),
  ],
  "3-4-3",
  "home"
);
const backThreeIds = wingback343
  .filter((slot) => slot.y === 18)
  .map((slot) => slot.player.id);
const wingbackSlots = wingback343.filter((slot) =>
  ["343-lwb", "343-rwb"].includes(slot.player.id)
);
check(
  "3-4-3 keeps center backs in defense and wingbacks on midfield edges",
  backThreeIds.length === 3 &&
    backThreeIds.every((id) => ["343-lcb", "343-cb", "343-rcb"].includes(id)) &&
    wingbackSlots.every((slot) => slot.y === 31) &&
    Math.min(...wingbackSlots.map((slot) => slot.x)) === 10 &&
    Math.max(...wingbackSlots.map((slot) => slot.x)) === 90
);

const mixedRoleSlots = layoutFormation(
  [
    { id: "gk", name: "GK", position: "Goalkeeper", section: "lineup" as const },
    { id: "cb1", name: "CB1", position: "Center Defender", section: "lineup" as const },
    { id: "cb2", name: "CB2", position: "Center Defender", section: "lineup" as const },
    { id: "lb", name: "LB", position: "Left Back", section: "lineup" as const },
    { id: "rb", name: "RB", position: "Right Back", section: "lineup" as const },
    { id: "dm", name: "DM", position: "Defensive Midfielder", section: "lineup" as const },
    { id: "cm", name: "CM", position: "Center Midfielder", section: "lineup" as const },
    { id: "am", name: "AM", position: "Attacking Midfielder", section: "lineup" as const },
    { id: "lw", name: "LW", position: "Left Winger", section: "lineup" as const },
    { id: "st", name: "ST", position: "Striker", section: "lineup" as const },
    { id: "rw", name: "RW", position: "Right Winger", section: "lineup" as const },
  ],
  "4-3-3",
  "home"
);
check(
  "midfield role names stay on midfield line",
  mixedRoleSlots.find((slot) => slot.player.id === "dm")?.y === 31 &&
    mixedRoleSlots.find((slot) => slot.player.id === "cm")?.y === 31 &&
    mixedRoleSlots.find((slot) => slot.player.id === "am")?.y === 31
);
check(
  "defenders and attackers stay on their own lines",
  ["cb1", "cb2", "lb", "rb"].every(
    (id) => mixedRoleSlots.find((slot) => slot.player.id === id)?.y === 18
  ) &&
    ["lw", "st", "rw"].every(
      (id) => mixedRoleSlots.find((slot) => slot.player.id === id)?.y === 44
    )
);
const arabicSideSlots = layoutFormation(
  [
    { id: "gk", name: "GK", position: "حارس", section: "lineup" as const },
    ...Array.from({ length: 4 }, (_, index) => ({
      id: `d${index}`,
      name: `D${index}`,
      position: "مدافع",
      section: "lineup" as const,
    })),
    { id: "rm-ar", name: "RM", position: "وسط يمين", section: "lineup" as const },
    { id: "cm-ar", name: "CM", position: "وسط", section: "lineup" as const },
    { id: "lm-ar", name: "LM", position: "وسط يسار", section: "lineup" as const },
    { id: "rw-ar", name: "RW", position: "جناح يمين", section: "lineup" as const },
    { id: "st-ar", name: "ST", position: "مهاجم", section: "lineup" as const },
    { id: "lw-ar", name: "LW", position: "جناح يسار", section: "lineup" as const },
  ],
  "4-3-3",
  "home"
);
check(
  "Arabic midfield and winger directions stay on exact lines and edges",
  arabicSideSlots.find((slot) => slot.player.id === "rm-ar")?.y === 31 &&
    arabicSideSlots.find((slot) => slot.player.id === "lm-ar")?.y === 31 &&
    arabicSideSlots.find((slot) => slot.player.id === "rw-ar")?.y === 44 &&
    arabicSideSlots.find((slot) => slot.player.id === "lw-ar")?.y === 44 &&
    arabicSideSlots.find((slot) => slot.player.id === "rm-ar")?.x === 10 &&
    arabicSideSlots.find((slot) => slot.player.id === "lm-ar")?.x === 90 &&
    arabicSideSlots.find((slot) => slot.player.id === "rw-ar")?.x === 10 &&
    arabicSideSlots.find((slot) => slot.player.id === "lw-ar")?.x === 90
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

const completedOfficialView = mergeTeamViewWithCurrentRoster(
  {
    formation: "4-3-3",
    source: "official",
    players: formation352Players.slice(0, 11).map((player) => ({
      ...player,
      section: "lineup" as const,
    })),
  },
  [
    {
      id: "current-roster-player",
      name: "Current Roster Player",
      position: "Forward",
      shirtNumber: null,
      photoUrl: null,
      section: "lineup",
      grid: "1:1",
    },
  ]
);
check(
  "current squad completes every lineup source without changing starters",
  completedOfficialView.source === "official" &&
    completedOfficialView.players.filter(
      (player) => player.section === "lineup"
    ).length === 11 &&
    completedOfficialView.players.some(
      (player) =>
        player.id === "current-roster-player" &&
        player.section === "bench" &&
        player.grid == null
    )
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
const completeSide = Array.from({ length: 11 }, (_, index) => ({
  id: `starter-${index}`,
  name: `Starter ${index}`,
  section: "lineup" as const,
}));
check(
  "lineup completeness rejects cached payloads missing a starter",
  !hasCompleteStartingLineups({
    homePlayers: completeSide.slice(0, 10),
    awayPlayers: completeSide,
  })
);
check(
  "lineup completeness accepts both teams with eleven starters",
  hasCompleteStartingLineups({
    homePlayers: completeSide,
    awayPlayers: completeSide,
  })
);

const lightMatchesWithoutLineup = dedupeDisplayMatches([
  {
    matchTime: "2026-06-26T02:00:00.000Z",
    homeTeam: { name: "Turkey", shortName: "Turkey" },
    awayTeam: { name: "USA", shortName: "USA" },
  },
  {
    matchTime: "2026-06-26T02:00:00.000Z",
    homeTeam: { name: "Paraguay", shortName: "Paraguay" },
    awayTeam: { name: "Australia", shortName: "Australia" },
  },
]);
check(
  "light upcoming matches stay visible without lineup data",
  lightMatchesWithoutLineup.length === 2
);

const riyadhNow = new Date(Date.now() + 3 * 60 * 60 * 1000);
const fiveAmRiyadhMatch = new Date(
  Date.UTC(
    riyadhNow.getUTCFullYear(),
    riyadhNow.getUTCMonth(),
    riyadhNow.getUTCDate() + 1,
    2,
    0,
    0,
    0
  )
).toISOString();
check(
  "5am Riyadh matches remain inside prediction window",
  isPredictionAllowed(fiveAmRiyadhMatch, "SCHEDULED")
);

const historyBaseMatch = {
  homeScore: null,
  awayScore: null,
  isKnockout: false,
  actualFinishType: null,
  penaltyWinnerTeamId: null,
  homeTeam: { id: "home", name: "Home", shortName: "H" },
  awayTeam: { id: "away", name: "Away", shortName: "A" },
  round: { id: "round", name: "Round" },
};
const lockedPredictionMatchTime = new Date(
  Date.now() + 5 * 60 * 1000
).toISOString();
const openPredictionMatchTime = new Date(
  Date.now() + 60 * 60 * 1000
).toISOString();
const historyEntries = buildMatchHistoryEntries({
  predictions: [
    {
      predHome: 1,
      predAway: 0,
      isDouble: false,
      points: 0,
      doubleBonus: 0,
      finishTypePoints: 0,
      penaltyWinnerPoints: 0,
      predictedFinishType: null,
      predictedPenaltyWinnerTeamId: null,
      match: {
        ...historyBaseMatch,
        id: "open",
        matchTime: openPredictionMatchTime,
        status: "SCHEDULED",
      },
    },
    {
      predHome: 2,
      predAway: 0,
      isDouble: false,
      points: 0,
      doubleBonus: 0,
      finishTypePoints: 0,
      penaltyWinnerPoints: 0,
      predictedFinishType: null,
      predictedPenaltyWinnerTeamId: null,
      match: {
        ...historyBaseMatch,
        id: "locked",
        matchTime: lockedPredictionMatchTime,
        status: "SCHEDULED",
      },
    },
    {
      predHome: 2,
      predAway: 1,
      isDouble: false,
      points: 5,
      doubleBonus: 0,
      finishTypePoints: 0,
      penaltyWinnerPoints: 0,
      predictedFinishType: null,
      predictedPenaltyWinnerTeamId: null,
      match: {
        ...historyBaseMatch,
        id: "finished",
        matchTime: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        status: "FINISHED",
        homeScore: 2,
        awayScore: 1,
      },
    },
  ],
  scorerPredictions: [],
  boldScorerBets: [],
  octopusBets: [],
});
check(
  "predictions history hides open-deadline matches and puts locked match first",
  historyEntries.length === 2 &&
    historyEntries[0].match.id === "locked" &&
    !historyEntries.some((entry) => entry.match.id === "open")
);
check(
  "round of 32 allows only one double",
  getMaxDoublesForUsageScope("wc:stage:round-of-32") === 1
);
check(
  "group stage keeps two doubles",
  getMaxDoublesForUsageScope("wc:group-gameweek:1") === 2
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

const exactOrdinalWideSlots = layoutFormation(
  [
    { id: "gk", name: "GK", position: "Goalkeeper", section: "lineup" as const, grid: "1" },
    { id: "rb", name: "RB", position: "Right Back", section: "lineup" as const, grid: "2" },
    { id: "lb", name: "LB", position: "Left Back", section: "lineup" as const, grid: "3" },
    { id: "cb1", name: "CB1", position: "Center Defender", section: "lineup" as const, grid: "4" },
    { id: "cb2", name: "CB2", position: "Center Defender", section: "lineup" as const, grid: "5" },
    { id: "cm", name: "CM", position: "Center Midfielder", section: "lineup" as const, grid: "6" },
    { id: "rm", name: "RM", position: "Right Midfielder", section: "lineup" as const, grid: "7" },
    { id: "lm", name: "LM", position: "Left Midfielder", section: "lineup" as const, grid: "8" },
    { id: "st", name: "ST", position: "Forward", section: "lineup" as const, grid: "9" },
    { id: "rw-as-mid", name: "RW", position: "Right Midfielder", section: "lineup" as const, grid: "10" },
    { id: "lw-as-mid", name: "LW", position: "Left Midfielder", section: "lineup" as const, grid: "11" },
  ],
  "4-3-3",
  "home"
);
check(
  "ordinal wide forwards stay on the forward line even when labelled midfielders",
  exactOrdinalWideSlots.find((slot) => slot.player.id === "lw-as-mid")?.y === 44 &&
    exactOrdinalWideSlots.find((slot) => slot.player.id === "rw-as-mid")?.y === 44
);
check(
  "ordinal right and left midfielders stay on their exact wide edges",
  exactOrdinalWideSlots.find((slot) => slot.player.id === "rm")?.x === 10 &&
    exactOrdinalWideSlots.find((slot) => slot.player.id === "lm")?.x === 90 &&
    exactOrdinalWideSlots.find((slot) => slot.player.id === "rw-as-mid")?.x === 10 &&
    exactOrdinalWideSlots.find((slot) => slot.player.id === "lw-as-mid")?.x === 90
);

const spainContradictingOrdinalSlots = layoutFormation(
  [
    { id: "gk", name: "GK", position: "Goalkeeper", section: "lineup" as const, grid: "1" },
    { id: "cucurella", name: "Marc Cucurella", position: "Left Back", section: "lineup" as const, grid: "3" },
    { id: "rodri", name: "Rodri", position: "Center Midfielder", section: "lineup" as const, grid: "4" },
    { id: "porro", name: "Pedro Porro", position: "Right Back", section: "lineup" as const, grid: "2" },
    { id: "laporte", name: "Aymeric Laporte", position: "Center Left Defender", section: "lineup" as const, grid: "6" },
    { id: "cm1", name: "CM1", position: "Center Midfielder", section: "lineup" as const, grid: "7" },
    { id: "cm2", name: "CM2", position: "Center Midfielder", section: "lineup" as const, grid: "8" },
    { id: "rw", name: "RW", position: "Right Wing", section: "lineup" as const, grid: "10" },
    { id: "st", name: "ST", position: "Forward", section: "lineup" as const, grid: "9" },
    { id: "lw", name: "LW", position: "Left Wing", section: "lineup" as const, grid: "11" },
    { id: "cb", name: "CB", position: "Center Defender", section: "lineup" as const, grid: "5" },
  ],
  "4-3-3",
  "home"
);
check(
  "contradicting ordinal places do not put Spain defender/midfielder on wrong lines",
  spainContradictingOrdinalSlots.find((slot) => slot.player.id === "laporte")?.y === 18 &&
    spainContradictingOrdinalSlots.find((slot) => slot.player.id === "rodri")?.y === 31
);

process.exit(failures === 0 ? 0 : 1);
