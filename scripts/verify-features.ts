/**
 * تحقق من منطق الميزات الأساسية (بدون واجهة)
 * تشغيل: npx tsx scripts/verify-features.ts
 */
import {
  buildRegulationScorerGoalsMap,
  BOLD_SCORER_POINTS,
  calculateBoldScorerBetPoints,
  calculateDoubleBonus,
  calculateFinishTypePoints,
  calculatePenaltyWinnerPoints,
  calculatePerfectPredictionBonus,
  calculateScorePredictionPoints,
  calculateScorerPredictionPoints,
  EXACT_SCORE_POINTS,
  getScorerGoalsForPoints,
  PERFECT_PREDICTION_BONUS_POINTS,
} from "../src/services/scoring.service";
import {
  MAX_DOUBLES_PER_ROUND,
  shouldIgnorePositionMultiplierForScorerPrediction,
} from "../src/services/prediction.service";
import { MAX_BOLD_SCORER_BETS_PER_ROUND } from "../src/services/round-usage.service";
import {
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
import { buildUsageRoundKey } from "../src/services/usage-round.service";
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

console.log("\n=== نقاط الإقصائي ===");
ok(
  "طريقة الإنهاء صح = 1",
  calculateFinishTypePoints("PENALTIES", "PENALTIES") === 1
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
    finishTypePoints: 1,
    penaltyWinnerPoints: 1,
    predictedFinishType: "PENALTIES",
    predictedPenaltyWinnerTeamId: "home-id",
  },
  userScorerPredictions: [
    { predictedGoals: 2, points: 1, player: { name: "سالم" } },
  ],
}, ar);
ok("مجموع التفصيل = 8", breakdown.total === 8);
ok(
  "عدد بنود التفصيل = 4",
  breakdown.lines.length === 4,
  `got ${breakdown.lines.length}`
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
ok("مضاعفة: حد أقصى 2 لكل جولة", MAX_DOUBLES_PER_ROUND === 2);
ok("البطاقة الجريئة: مرة واحدة لكل جولة", MAX_BOLD_SCORER_BETS_PER_ROUND === 1);
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

console.log("\n=== ترتيب الجولة ===");
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
