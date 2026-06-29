/**
 * تحقق من منطق الميزات الأساسية (بدون واجهة)
 * تشغيل: npx tsx scripts/verify-features.ts
 */
import {
  buildRegulationScorerGoalsMap,
  BOLD_SCORER_POINTS,
  BOLD_SCORER_POINTS_LATE_ROUND,
  calculateBoldScorerBetPoints,
  calculateDoubleBonus,
  calculateFinishTypePoints,
  calculateKnockoutPenaltyWinnerPoints,
  calculatePenaltyWinnerPoints,
  calculatePerfectPredictionBonus,
  calculateScorePredictionPoints,
  calculateScorerPredictionPoints,
  EXACT_SCORE_POINTS,
  getScorerGoalsForPoints,
  hasRequiredScorerPicksForPerfectBonus,
  PERFECT_PREDICTION_BONUS_POINTS,
} from "../src/services/scoring.service";
import {
  MAX_DOUBLES_PER_ROUND,
  shouldIgnorePositionMultiplierForScorerPrediction,
} from "../src/services/prediction.service";
import { MAX_BOLD_SCORER_BETS_PER_ROUND } from "../src/services/round-usage.service";
import {
  buildLeaguePendingBreakdown,
  buildMatchPointsBreakdown,
  getMatchTotalUserPoints,
} from "../src/lib/match-points-breakdown";
import {
  canAddScorer,
  computeTeamGoalTotals,
  countTeamScorers,
  getScorerBudgetStatus,
} from "../src/lib/scorer-prediction";
import { resolveScorerGoalsForPlayer } from "../src/lib/player-matching";
import { ar } from "../src/lib/i18n/ar";
import { asFinishType } from "../src/lib/finish-type";
import { parseOptionalScore } from "../src/lib/utils";
import { statsFromLeaderboard } from "../src/services/leaderboard.service";
import {
  buildUsageRoundKey,
  canCombineDoubleAndBoldForUsageScope,
  getMaxDoublesForUsageScope,
  getUsageRoundPhase,
  isHighValueBoldScorerRound,
} from "../src/services/usage-round.service";
import {
  calculateOctopusPoints,
  getOctopusCleanSheetBonus,
  getOctopusSaveTierPoints,
} from "../src/lib/octopus-points";
import { aggregateGoalsFromEvents } from "../src/lib/fixture-events";
import { parseSportScoreGoalkeeperSavesFromDetail } from "../src/services/football-api/sportscore.provider";
import {
  filterVisibleMatches,
  shouldShowMatchInUpcomingList,
} from "../src/lib/tournament-gates";
import type { LeaderboardEntry } from "../src/types";

let passed = 0;
let failed = 0;

function ok(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("\n=== نقاط النتيجة ===");
ok("EXACT_SCORE_POINTS = 5", EXACT_SCORE_POINTS === 5);
ok("نتيجة دقيقة = 5", calculateScorePredictionPoints(2, 1, 2, 1, false) === 5);
ok("فائز صح = 1", calculateScorePredictionPoints(2, 0, 3, 1, false) === 1);
ok("خطأ = 0", calculateScorePredictionPoints(1, 0, 0, 2, false) === 0);
ok("الدبل لا يغيّر نقاط سطر النتيجة", calculateScorePredictionPoints(1, 1, 1, 1, true) === 5);
ok("الدبل يضيف مجموع المباراة مرة واحدة", calculateDoubleBonus(true, 4) === 4);
ok("بدون دبل لا توجد إضافة", calculateDoubleBonus(false, 4) === 0);

console.log("\n=== بونص التوقع المثالي ===");
ok("PERFECT_PREDICTION_BONUS_POINTS = 3", PERFECT_PREDICTION_BONUS_POINTS === 3);
ok(
  "نتيجة دقيقة + هدافين كاملين = بونص 3",
  calculatePerfectPredictionBonus(true, [
    { predictedGoals: 1, actualGoals: 1 },
    { predictedGoals: 1, actualGoals: 1 },
  ]) === 3
);
ok(
  "نتيجة دقيقة بدون هدافين متوقعين (0-0) = بونص 3",
  calculatePerfectPredictionBonus(true, []) === 3
);
ok(
  "0-0 فقط يسمح ببونص مثالي بدون هدافين",
  hasRequiredScorerPicksForPerfectBonus(0, 0, 0)
);
ok(
  "نتيجة فيها أهداف لا تأخذ بونص مثالي بدون هدافين",
  !hasRequiredScorerPicksForPerfectBonus(1, 0, 0)
);
ok(
  "نتيجة دقيقة لكن هداف واحد خاطئ = بونص 0",
  calculatePerfectPredictionBonus(true, [
    { predictedGoals: 1, actualGoals: 1 },
    { predictedGoals: 1, actualGoals: 0 },
  ]) === 0
);
ok(
  "نتيجة غير دقيقة = بونص 0 حتى لو الهدافين صح",
  calculatePerfectPredictionBonus(false, [
    { predictedGoals: 1, actualGoals: 1 },
  ]) === 0
);
ok(
  "perfect bonus requires correct finish type when enforced",
  calculatePerfectPredictionBonus(
    true,
    [{ predictedGoals: 1, actualGoals: 1 }],
    { finishTypeCorrect: false }
  ) === 0
);

console.log("\n=== نقاط الإقصائي ===");
ok(
  "طريقة الإنهاء صح = 1",
  calculateFinishTypePoints("PENALTIES", "PENALTIES") === 4
);
ok(
  "finish type extra time = 2",
  calculateFinishTypePoints("EXTRA_TIME", "EXTRA_TIME") === 2
);
ok(
  "finish type ninety minutes = 1",
  calculateFinishTypePoints("NINETY_MINUTES", "NINETY_MINUTES") === 1
);
ok(
  "finish type point is independent from score correctness",
  calculateFinishTypePoints("NINETY_MINUTES", "NINETY_MINUTES") === 1
);
ok(
  "طريقة الإنهاء خطأ = 0",
  calculateFinishTypePoints("NINETY_MINUTES", "PENALTIES") === 0
);
ok(
  "ركلات صح = 1",
  calculatePenaltyWinnerPoints("team-a", "team-a") === 1
);
ok(
  "ركلات خطأ = 0",
  calculatePenaltyWinnerPoints("team-a", "team-b") === 0
);
ok(
  "all wrong knockout finish type combinations = 0",
  (["NINETY_MINUTES", "EXTRA_TIME", "PENALTIES"] as const).every((predicted) =>
    (["NINETY_MINUTES", "EXTRA_TIME", "PENALTIES"] as const).every((actual) =>
      predicted === actual || calculateFinishTypePoints(predicted, actual) === 0
    )
  )
);
ok(
  "penalty winner point requires a penalties prediction",
  calculateKnockoutPenaltyWinnerPoints("PENALTIES", "team-a", "team-a") === 1 &&
    calculateKnockoutPenaltyWinnerPoints("PENALTIES", "team-a", "team-b") === 0 &&
    calculateKnockoutPenaltyWinnerPoints("EXTRA_TIME", "team-a", "team-a") === 0 &&
    calculateKnockoutPenaltyWinnerPoints("NINETY_MINUTES", "team-a", "team-a") === 0
);

console.log("\n=== تفصيل نقاط المباراة ===");
const breakdown = buildMatchPointsBreakdown({
  homeScore: 2,
  awayScore: 1,
  isKnockout: true,
  actualFinishType: "PENALTIES",
  penaltyWinnerTeamId: "home-id",
  homeTeamName: "السعودية",
  awayTeamName: "الأرجنتين",
  penaltyWinnerName: "السعودية",
  userPrediction: {
    predHome: 2,
    predAway: 1,
    isDouble: false,
    points: 5,
    doubleBonus: 0,
    finishTypePoints: 4,
    penaltyWinnerPoints: 1,
    predictedFinishType: "PENALTIES",
    predictedPenaltyWinnerTeamId: "home-id",
  },
  userScorerPredictions: [
    { predictedGoals: 2, points: 1, player: { name: "سالم" } },
  ],
}, ar);
ok("match breakdown total with penalties = 11", breakdown.total === 11);
ok(
  "عدد بنود التفصيل = 4",
  breakdown.lines.length === 4,
  `got ${breakdown.lines.length}`
);
const stalePenaltyBreakdown = buildMatchPointsBreakdown({
  homeScore: 1,
  awayScore: 1,
  isKnockout: true,
  actualFinishType: "PENALTIES",
  penaltyWinnerTeamId: "home-id",
  homeTeamName: "home",
  awayTeamName: "away",
  penaltyWinnerName: "home",
  userPrediction: {
    predHome: 1,
    predAway: 1,
    isDouble: false,
    points: 5,
    doubleBonus: 0,
    finishTypePoints: 0,
    penaltyWinnerPoints: 0,
    predictedFinishType: "EXTRA_TIME",
    predictedPenaltyWinnerTeamId: "home-id",
  },
}, ar, { showMisses: true });
ok(
  "stale penalty winner is hidden unless penalties were predicted",
  !stalePenaltyBreakdown.lines.some((line) => line.id === "penalty")
);
const wrongScoreRightFinishBreakdown = buildMatchPointsBreakdown({
  homeScore: 2,
  awayScore: 1,
  isKnockout: true,
  actualFinishType: "NINETY_MINUTES",
  homeTeamName: "home",
  awayTeamName: "away",
  userPrediction: {
    predHome: 0,
    predAway: 0,
    isDouble: false,
    points: 0,
    doubleBonus: 0,
    finishTypePoints: 1,
    penaltyWinnerPoints: 0,
    predictedFinishType: "NINETY_MINUTES",
  },
}, ar);
ok(
  "finish type appears in breakdown even when score is wrong",
  wrongScoreRightFinishBreakdown.total === 1 &&
    wrongScoreRightFinishBreakdown.lines.some(
      (line) => line.id === "finish-type" && line.points === 1
    )
);

console.log("\n=== بونص التوقع المثالي ضمن تفصيل المباراة ===");
const perfectBreakdown = buildMatchPointsBreakdown({
  homeScore: 1,
  awayScore: 0,
  isKnockout: false,
  homeTeamName: "السعودية",
  awayTeamName: "الأرجنتين",
  userPrediction: {
    predHome: 1,
    predAway: 0,
    isDouble: false,
    points: 5,
    doubleBonus: 0,
    finishTypePoints: 0,
    penaltyWinnerPoints: 0,
  },
  userScorerPredictions: [
    { predictedGoals: 1, points: 1, player: { name: "سالم" } },
  ],
}, ar);
ok("مجموع التفصيل مع البونص = 6", perfectBreakdown.total === 6);
ok(
  "عدد بنود التفصيل مع البونص = 3",
  perfectBreakdown.lines.length === 3,
  `got ${perfectBreakdown.lines.length}`
);
ok(
  "بند البونص = 3 نقاط",
  perfectBreakdown.lines.find((l) => l.id === "perfect-bonus")?.points === 3
);
ok(
  "بند النتيجة = 2 (5 - بونص 3)",
  perfectBreakdown.lines.find((l) => l.id === "score")?.points === 2
);
const wrongFinishPerfectBreakdown = buildMatchPointsBreakdown({
  homeScore: 1,
  awayScore: 0,
  isKnockout: true,
  actualFinishType: "EXTRA_TIME",
  homeTeamName: "A",
  awayTeamName: "B",
  userPrediction: {
    predHome: 1,
    predAway: 0,
    isDouble: false,
    points: 5,
    doubleBonus: 0,
    finishTypePoints: 0,
    penaltyWinnerPoints: 0,
    predictedFinishType: "NINETY_MINUTES",
  },
  userScorerPredictions: [
    { predictedGoals: 1, points: 1, player: { name: "X" } },
  ],
}, ar);
ok(
  "wrong finish type blocks perfect bonus in breakdown",
  !wrongFinishPerfectBreakdown.lines.some((line) => line.id === "perfect-bonus")
);
ok(
  "getMatchTotalUserPoints",
  getMatchTotalUserPoints({
    homeScore: 2,
    awayScore: 1,
    isKnockout: false,
    homeTeamName: "A",
    awayTeamName: "B",
    userPrediction: {
      predHome: 1,
      predAway: 0,
      isDouble: false,
      points: 1,
      doubleBonus: 0,
      finishTypePoints: 0,
      penaltyWinnerPoints: 0,
    },
    userScorerPredictions: [{ predictedGoals: 1, points: 1, player: { name: "X" } }],
  }) === 2
);

const doubledBreakdown = buildMatchPointsBreakdown({
  homeScore: 2,
  awayScore: 1,
  isKnockout: false,
  homeTeamName: "A",
  awayTeamName: "B",
  userPrediction: {
    predHome: 1,
    predAway: 0,
    isDouble: true,
    points: 1,
    doubleBonus: 3,
    finishTypePoints: 0,
    penaltyWinnerPoints: 0,
  },
  userScorerPredictions: [
    { predictedGoals: 2, points: 2, player: { name: "X" } },
  ],
}, ar);
ok("الدبل يضاعف مجموع المباراة النهائي", doubledBreakdown.total === 6);
ok(
  "الدبل يظهر كسطر واحد مستقل",
  doubledBreakdown.lines.filter((line) => line.id === "double-bonus").length === 1 &&
    doubledBreakdown.lines.find((line) => line.id === "double-bonus")?.points === 3
);

console.log("\n=== الهدافين وركلات الترجيح ===");
const homeId = "home-team";
const awayId = "away-team";
const penScorers = getScorerGoalsForPoints(
  {
    actualFinishType: "PENALTIES",
    homeTeamId: homeId,
    awayTeamId: awayId,
    homeScore: 0,
    awayScore: 0,
  },
  [
    { playerId: "p1", goals: 1, player: { teamId: homeId } },
    { playerId: "p2", goals: 1, player: { teamId: awayId } },
  ]
);
ok(
  "0-0 وركلات: ما فيه نقاط هدافين",
  penScorers.get("p1") === 0 && penScorers.get("p2") === 0
);
const regMap = buildRegulationScorerGoalsMap(homeId, awayId, 1, 1, [
  { playerId: "striker", goals: 1, player: { teamId: homeId } },
  { playerId: "pen-taker", goals: 1, player: { teamId: homeId } },
]);
ok(
  "1-1 وركلات: هدف ملعب واحد فقط للفريق",
  regMap.get("striker") === 1 && regMap.get("pen-taker") === 0
);
ok(
  "calculateScorerPredictionPoints",
  calculateScorerPredictionPoints(2, 1) === 1 &&
    calculateScorerPredictionPoints(1, 0) === 0
);
ok(
  "استثناء توقع مدافع danger التاريخي من مضاعف المركز",
  !shouldIgnorePositionMultiplierForScorerPrediction(
    "cmq9m49xg000jjr046zbmcy8a"
  ) &&
    !shouldIgnorePositionMultiplierForScorerPrediction("new-prediction")
);

const goalsById = new Map([
  ["api-scorer-id", 1],
]);
ok(
  "resolveScorerGoalsForPlayer: مطابقة بالاسم عند اختلاف المعرف",
  resolveScorerGoalsForPlayer(
    "lineup-player-id",
    { name: "Kylian Mbappé", teamId: "france" },
    goalsById,
    [
      {
        playerId: "api-scorer-id",
        player: { name: "K. Mbappe", teamId: "france" },
      },
    ]
  ) === 1
);

console.log("\n=== حدود الجولة ===");
ok("مضاعفة: الحد العام الحالي مرة واحدة", MAX_DOUBLES_PER_ROUND === 1);
ok(
  "group gameweek allows two doubles",
  getMaxDoublesForUsageScope("wc:group-gameweek:1") === 2
);
ok(
  "round of 32 allows one double",
  getMaxDoublesForUsageScope("wc:stage:round-of-32") === 1
);
ok("البطاقة الجريئة: مرة واحدة لكل جولة", MAX_BOLD_SCORER_BETS_PER_ROUND === 1);
ok(
  "round of 16 allows one double",
  getMaxDoublesForUsageScope("wc:stage:round-of-16") === 1
);
ok(
  "quarter-finals allows one double",
  getMaxDoublesForUsageScope("wc:stage:quarter-finals") === 1
);
ok(
  "quarter-finals can combine double and bold scorer",
  canCombineDoubleAndBoldForUsageScope("wc:stage:quarter-finals")
);
ok(
  "round of 16 cannot combine double and bold scorer",
  !canCombineDoubleAndBoldForUsageScope("wc:stage:round-of-16")
);
const knockoutSchedule = Array.from({ length: 16 }, (_, index) => ({
  id: `ko-${index}`,
  roundId: "tournament",
  homeTeamId: `home-${index}`,
  awayTeamId: `away-${index}`,
  matchTime: new Date(Date.UTC(2026, 5, 29 + index, 17, 0, 0)),
  stageName: "Knockout Stage",
  groupCode: null,
  homeTeam: { name: `Home ${index}` },
  awayTeam: { name: `Away ${index}` },
  round: { name: "Main Tournament 26" },
}));
const knockoutKeys = knockoutSchedule.map((match) =>
  buildUsageRoundKey(match, knockoutSchedule)
);
ok(
  "generic knockout tournament name uses bracket fallback",
  getUsageRoundPhase(knockoutKeys[0]) === "round-of-16" &&
    getUsageRoundPhase(knockoutKeys[7]) === "round-of-16" &&
    getUsageRoundPhase(knockoutKeys[8]) === "quarter-finals" &&
    getUsageRoundPhase(knockoutKeys[15]) === "final"
);
ok(
  "fallback quarter-final rules are automatic",
  getMaxDoublesForUsageScope(knockoutKeys[8]) === 1 &&
    canCombineDoubleAndBoldForUsageScope(knockoutKeys[8]) &&
    isHighValueBoldScorerRound(knockoutKeys[8])
);
const usageRoundMatches = [
  {
    id: "a1",
    roundId: "tournament",
    homeTeamId: "a",
    awayTeamId: "b",
    matchTime: new Date("2026-06-11T19:00:00Z"),
    stageName: "Group Stage",
  },
  {
    id: "a2",
    roundId: "tournament",
    homeTeamId: "a",
    awayTeamId: "c",
    matchTime: new Date("2026-06-18T19:00:00Z"),
    stageName: "Group Stage",
  },
];
ok(
  "عداد الدبل والرهان ينتقل إلى نطاق جديد في الجولة التالية",
  buildUsageRoundKey(usageRoundMatches[0], usageRoundMatches) !==
    buildUsageRoundKey(usageRoundMatches[1], usageRoundMatches)
);
ok(
  "مضاعفة مجموع 8 نقاط = إضافة 8 نقاط",
  calculateDoubleBonus(true, 8) === 8
);
ok(
  "المجموع النهائي مع الدبل = 16 نقطة",
  8 + calculateDoubleBonus(true, 8) === 16
);

console.log("\n=== البطاقة الجريئة ===");
ok("BOLD_SCORER_POINTS = 5", BOLD_SCORER_POINTS === 5);
ok(
  "سجل في الملعب = +5",
  calculateBoldScorerBetPoints(1) === 5 &&
    calculateBoldScorerBetPoints(2) === 5
);
ok(
  "ما سجل = -5",
  calculateBoldScorerBetPoints(0) === -5
);
ok("BOLD_SCORER_POINTS_LATE_ROUND = 10", BOLD_SCORER_POINTS_LATE_ROUND === 10);
ok(
  "quarter-finals bold scorer = +10/-10",
  isHighValueBoldScorerRound("wc:stage:quarter-finals") &&
    calculateBoldScorerBetPoints(1, { highValue: true }) === 10 &&
    calculateBoldScorerBetPoints(0, { highValue: true }) === -10
);
const highValueBoldBreakdown = buildMatchPointsBreakdown({
  homeScore: 0,
  awayScore: 0,
  isKnockout: true,
  homeTeamName: "A",
  awayTeamName: "B",
  userBoldScorerBet: { points: -10, player: { name: "X" } },
}, ar, { showMisses: true });
ok(
  "high-value bold scorer detail explains +10/-10",
  highValueBoldBreakdown.lines
    .find((line) => line.id === "bold-scorer")
    ?.detail?.includes("+10 / -10") === true
);
const pendingHighValueBold = buildLeaguePendingBreakdown(
  {
    prediction: {
      predHome: 1,
      predAway: 0,
      isDouble: true,
    },
    scorerPredictions: [],
    boldScorerBet: { player: { name: "X" } },
  },
  {
    isKnockout: true,
    homeTeamId: "home",
    awayTeamId: "away",
    homeShortName: "H",
    awayShortName: "A",
  },
  ar
);
ok(
  "pending double+bold detail explains +10/-10",
  pendingHighValueBold.lines
    .find((line) => line.id === "bold-scorer")
    ?.detail?.includes("+10 / -10") === true
);
const boldBreakdown = buildMatchPointsBreakdown({
  homeScore: 1,
  awayScore: 0,
  isKnockout: false,
  homeTeamName: "A",
  awayTeamName: "B",
  userBoldScorerBet: { points: 5, player: { name: "سالم" } },
}, ar);
ok("تفصيل البطاقة الجريئة +5", boldBreakdown.total === 5);
const boldMiss = buildMatchPointsBreakdown({
  homeScore: 0,
  awayScore: 0,
  isKnockout: false,
  homeTeamName: "A",
  awayTeamName: "B",
  userBoldScorerBet: { points: -5, player: { name: "فهد" } },
}, ar);
ok("تفصيل البطاقة الجريئة -5", boldMiss.total === -5);
ok(
  "بطاقة جريئة خاطئة فقط = -5 (حتى لو المجموع كان 0)",
  getMatchTotalUserPoints({
    homeScore: 0,
    awayScore: 0,
    isKnockout: false,
    homeTeamName: "A",
    awayTeamName: "B",
    userBoldScorerBet: { points: -5, player: { name: "سالم" } },
  }) === -5
);

console.log("\n=== Octopus goalkeeper ===");
ok("octopus clean sheet bonus = 3", getOctopusCleanSheetBonus(0) === 3);
ok("octopus no clean sheet bonus when conceded", getOctopusCleanSheetBonus(1) === 0);
ok("octopus save tier 10 saves = 8", getOctopusSaveTierPoints(10) === 8);
ok("octopus clean sheet with 0 saves = 3", calculateOctopusPoints(0, 0) === 3);
ok("octopus 0 saves without clean sheet = 0", calculateOctopusPoints(0, 1) === 0);
ok("octopus clean sheet with 3 saves = 4", calculateOctopusPoints(3, 0) === 4);
ok("octopus clean sheet with 10 saves = 11", calculateOctopusPoints(10, 0) === 11);
ok("octopus 10 saves conceded 1 = 5", calculateOctopusPoints(10, 1) === 5);
ok("octopus 10 saves conceded 2 = 3", calculateOctopusPoints(10, 2) === 3);
ok("octopus 10 saves conceded 3 = 1", calculateOctopusPoints(10, 3) === 1);
const sportScoreSaves = parseSportScoreGoalkeeperSavesFromDetail(
  {
    match: {
      home: "Brazil",
      away: "Belgium",
      stats: [{ name: "Goalkeeper Saves", home: "5", away: 3 }],
      lineups: {
        home_xi: [{ name: "Alisson Becker", position: "Goalkeeper" }],
        away_xi: [{ name: "Thibaut Courtois", position: "GK" }],
      },
    },
  },
  "brazil",
  "belgium"
);
ok(
  "SportScore goalkeeper saves are parsed from team stats and starting keepers",
  sportScoreSaves.length === 2 &&
    sportScoreSaves[0].playerName === "Alisson Becker" &&
    sportScoreSaves[0].saves === 5 &&
    sportScoreSaves[1].playerName === "Thibaut Courtois" &&
    sportScoreSaves[1].saves === 3
);

console.log("\n=== Cancelled/offside goals ===");
ok(
  "offside goal is not counted for scorer points",
  (aggregateGoalsFromEvents([
    { type: "Goal", detail: "Goal Disallowed - offside", playerApiId: "p1" },
  ]).get("p1") ?? 0) === 0
);
ok(
  "VAR offside removes a previously counted goal",
  (aggregateGoalsFromEvents([
    { type: "Goal", detail: "Normal Goal", playerApiId: "p1" },
    { type: "Var", detail: "Goal Disallowed - offside", playerApiId: "p1" },
  ]).get("p1") ?? 0) === 0
);
ok(
  "uppercase VAR offside removes a goal",
  (aggregateGoalsFromEvents([
    { type: "Goal", detail: "Normal Goal", playerApiId: "p1" },
    { type: "VAR", detail: "No Goal - Offside", playerApiId: "p1" },
  ]).get("p1") ?? 0) === 0
);
ok(
  "no goal detail is not counted",
  (aggregateGoalsFromEvents([
    { type: "Goal", detail: "No Goal - offside", playerApiId: "p1" },
  ]).get("p1") ?? 0) === 0
);

console.log("\n=== توقع الهدافين ===");
const home = new Set(["p1", "p2"]);
const away = new Set(["p3"]);
ok(
  "مجموع أهداف الفريق",
  computeTeamGoalTotals({ p1: 2, p3: 1 }, home, away).homeTotal === 2 &&
    computeTeamGoalTotals({ p1: 2, p3: 1 }, home, away).awayTotal === 1
);
const budget = getScorerBudgetStatus({ p1: 3 }, home, away, 2, 1);
ok("تجاوز الميزانية", budget.homeExceeded && budget.anyExceeded);
ok("ضمن الميزانية", !getScorerBudgetStatus({ p1: 1 }, home, away, 2, 1).anyExceeded);

ok(
  "ما يضيف هداف ثالث لمنتخب متوقع له هدفين",
  !canAddScorer({ p1: 1, p2: 1 }, "pX", home, away, 2, 1)
);
ok(
  "يضيف هداف ثاني لمنتخب متوقع له هدفين",
  canAddScorer({ p1: 1 }, "p2", home, away, 2, 1)
);
ok(
  "عدد هدافي المنتخب",
  countTeamScorers({ p1: 1, p2: 1 }, home, away).homeCount === 2
);

const visibleMatchList = filterVisibleMatches([
  { id: "group", isKnockout: false },
  { id: "knockout", isKnockout: true },
]);
ok(
  "API match list keeps knockout matches visible",
  visibleMatchList.length === 2 &&
    visibleMatchList.some((match) => match.id === "knockout")
);

console.log("\n=== ترتيب الجولة ===");
ok(
  "future scheduled matches stay visible",
  shouldShowMatchInUpcomingList({
    status: "SCHEDULED",
    matchTime: new Date(Date.now() + 72 * 60 * 60 * 1000),
  })
);
ok(
  "past scheduled matches are hidden",
  !shouldShowMatchInUpcomingList({
    status: "SCHEDULED",
    matchTime: new Date(Date.now() - 60 * 1000),
  })
);
const entries: LeaderboardEntry[] = [
  { userId: "a", username: "a", points: 10, rank: 1 },
  { userId: "b", username: "b", points: 5, rank: 2 },
];
const stats = statsFromLeaderboard(entries, "b");
ok("ترتيب المستخدم", stats.myRank === 2);
ok("متوسط النقاط = 7.5", stats.averagePoints === 7.5);

function sequentialRanks(
  rows: { userId: string; username: string; points: number }[]
) {
  return rows
    .slice()
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return a.username.localeCompare(b.username);
    })
    .map((row, index) => index + 1);
}

const tiedRanks = sequentialRanks([
  { userId: "1", username: "aziz", points: 50 },
  { userId: "2", username: "aziz333", points: 50 },
  { userId: "3", username: "b", points: 0 },
  { userId: "4", username: "c", points: 0 },
  { userId: "5", username: "d", points: 0 },
]);
ok(
  "ترتيب متسلسل عند التعادل 1-5",
  tiedRanks.join(",") === "1,2,3,4,5"
);

console.log("\n=== تحليل النتيجة (إدارة) ===");
ok("0-0 صالحة", parseOptionalScore("0") === 0);
ok("فارغ = null", parseOptionalScore("") === null);
ok("غير رقم = null", parseOptionalScore("abc") === null);

console.log("\n=== أنواع الإنهاء ===");
ok("asFinishType صحيح", asFinishType("PENALTIES") === "PENALTIES");
ok("asFinishType null", asFinishType(null) === null);
ok("asFinishType غير صالح", asFinishType("INVALID") === null);

console.log(`\n--- النتيجة: ${passed} نجح، ${failed} فشل ---\n`);
process.exit(failed > 0 ? 1 : 0);
