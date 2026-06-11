/**
 * تحقق من منطق الميزات الأساسية (بدون واجهة)
 * تشغيل: npx tsx scripts/verify-features.ts
 */
import {
  buildRegulationScorerGoalsMap,
  BOLD_SCORER_POINTS,
  calculateBoldScorerBetPoints,
  calculateFinishTypePoints,
  calculatePenaltyWinnerPoints,
  calculateScorePredictionPoints,
  calculateScorerPredictionPoints,
  getScorerGoalsForPoints,
} from "../src/services/scoring.service";
import {
  buildMatchPointsBreakdown,
  getMatchTotalUserPoints,
} from "../src/lib/match-points-breakdown";
import {
  computeTeamGoalTotals,
  getScorerBudgetStatus,
} from "../src/lib/scorer-prediction";
import { asFinishType } from "../src/lib/finish-type";
import { statsFromLeaderboard } from "../src/services/leaderboard.service";
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
ok("نتيجة دقيقة = 3", calculateScorePredictionPoints(2, 1, 2, 1, false) === 3);
ok("فائز صح = 1", calculateScorePredictionPoints(2, 0, 3, 1, false) === 1);
ok("خطأ = 0", calculateScorePredictionPoints(1, 0, 0, 2, false) === 0);
ok("مضاعفة نتيجة دقيقة = 6", calculateScorePredictionPoints(1, 1, 1, 1, true) === 6);
ok("مضاعفة فائز = 2", calculateScorePredictionPoints(2, 0, 3, 1, true) === 2);

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
    points: 3,
    finishTypePoints: 1,
    penaltyWinnerPoints: 1,
    predictedFinishType: "PENALTIES",
    predictedPenaltyWinnerTeamId: "home-id",
  },
  userScorerPredictions: [
    { predictedGoals: 2, points: 1, player: { name: "سالم" } },
  ],
});
ok("مجموع التفصيل = 6", breakdown.total === 6);
ok(
  "عدد بنود التفصيل = 4",
  breakdown.lines.length === 4,
  `got ${breakdown.lines.length}`
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
      finishTypePoints: 0,
      penaltyWinnerPoints: 0,
    },
    userScorerPredictions: [{ predictedGoals: 1, points: 1, player: { name: "X" } }],
  }) === 2
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

console.log("\n=== البطاقة الجريئة ===");
ok("BOLD_SCORER_POINTS = 4", BOLD_SCORER_POINTS === 4);
ok(
  "سجل في الملعب = +4",
  calculateBoldScorerBetPoints(1) === 4 &&
    calculateBoldScorerBetPoints(2) === 4
);
ok(
  "ما سجل = -4",
  calculateBoldScorerBetPoints(0) === -4
);
const boldBreakdown = buildMatchPointsBreakdown({
  homeScore: 1,
  awayScore: 0,
  isKnockout: false,
  homeTeamName: "A",
  awayTeamName: "B",
  userBoldScorerBet: { points: 4, player: { name: "سالم" } },
});
ok("تفصيل البطاقة الجريئة +4", boldBreakdown.total === 4);
const boldMiss = buildMatchPointsBreakdown({
  homeScore: 0,
  awayScore: 0,
  isKnockout: false,
  homeTeamName: "A",
  awayTeamName: "B",
  userBoldScorerBet: { points: -4, player: { name: "فهد" } },
});
ok("تفصيل البطاقة الجريئة -4", boldMiss.total === -4);
ok(
  "بطاقة جريئة خاطئة فقط = -4 (حتى لو المجموع كان 0)",
  getMatchTotalUserPoints({
    homeScore: 0,
    awayScore: 0,
    isKnockout: false,
    homeTeamName: "A",
    awayTeamName: "B",
    userBoldScorerBet: { points: -4, player: { name: "سالم" } },
  }) === -4
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

console.log("\n=== ترتيب الجولة ===");
const entries: LeaderboardEntry[] = [
  { userId: "a", username: "a", points: 10, rank: 1 },
  { userId: "b", username: "b", points: 5, rank: 2 },
];
const stats = statsFromLeaderboard(entries, "b");
ok("ترتيب المستخدم", stats.myRank === 2);
ok("متوسط النقاط = 7.5", stats.averagePoints === 7.5);

console.log("\n=== أنواع الإنهاء ===");
ok("asFinishType صحيح", asFinishType("PENALTIES") === "PENALTIES");
ok("asFinishType null", asFinishType(null) === null);
ok("asFinishType غير صالح", asFinishType("INVALID") === null);

console.log(`\n--- النتيجة: ${passed} نجح، ${failed} فشل ---\n`);
process.exit(failed > 0 ? 1 : 0);
