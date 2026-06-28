import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { WC_2026_BRACKET, type BracketSlot } from "@/lib/wc-bracket";
import { normalizeTeamIdentity } from "@/lib/team-identity";
import type { LeaderboardEntry } from "@/types";

export const KNOCKOUT_ROUND_POINTS = {
  roundOf32: 1,
  roundOf16: 2,
  quarterFinals: 4,
  semiFinals: 6,
  final: 10,
} as const;

const ROUND_DEFS = [
  {
    key: "roundOf32",
    labelAr: "دور الـ32",
    labelEn: "Round of 32",
    points: KNOCKOUT_ROUND_POINTS.roundOf32,
    matchNos: [73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88],
  },
  {
    key: "roundOf16",
    labelAr: "دور الـ16",
    labelEn: "Round of 16",
    points: KNOCKOUT_ROUND_POINTS.roundOf16,
    matchNos: [89, 90, 91, 92, 93, 94, 95, 96],
  },
  {
    key: "quarterFinals",
    labelAr: "ربع النهائي",
    labelEn: "Quarter-finals",
    points: KNOCKOUT_ROUND_POINTS.quarterFinals,
    matchNos: [97, 98, 99, 100],
  },
  {
    key: "semiFinals",
    labelAr: "نصف النهائي",
    labelEn: "Semi-finals",
    points: KNOCKOUT_ROUND_POINTS.semiFinals,
    matchNos: [101, 102],
  },
  {
    key: "final",
    labelAr: "النهائي",
    labelEn: "Final",
    points: KNOCKOUT_ROUND_POINTS.final,
    matchNos: [104],
  },
] as const;

const PREDICTION_MATCH_NOS = ROUND_DEFS.flatMap((round) => round.matchNos);
const MATCH_NO_TO_ROUND = new Map(
  ROUND_DEFS.flatMap((round) =>
    round.matchNos.map((matchNo) => [matchNo, round] as const)
  )
);

type TeamRef = { id: string; name: string; shortName: string; logoUrl: string | null };
type Picks = Record<string, string>;

function isRealTeam(team: Pick<TeamRef, "name">) {
  const identity = normalizeTeamIdentity(team.name);
  return Boolean(identity && identity !== "tbd" && !identity.includes("to be"));
}

function isLocked(deadline: Date | null, now = new Date()) {
  return deadline != null && now >= deadline;
}

function slotLabel(slot: BracketSlot) {
  if (slot.type === "WINNER") return `1${slot.group}`;
  if (slot.type === "RUNNER_UP") return `2${slot.group}`;
  if (slot.type === "THIRD_FOR_WINNER") return `3rd/${slot.winnerGroup}`;
  if (slot.type === "WINNER_OF") return `W${slot.matchNo}`;
  return `L${slot.matchNo}`;
}

function pickObject(value: Prisma.JsonValue | null | undefined): Picks {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Picks = {};
  for (const [key, teamId] of Object.entries(value)) {
    if (/^\d+$/.test(key) && typeof teamId === "string" && teamId) {
      result[key] = teamId;
    }
  }
  return result;
}

function getMatchWinnerTeamId(match: {
  status: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  actualFinishType: string | null;
  penaltyWinnerTeamId: string | null;
}) {
  if (match.status !== "FINISHED") return null;
  if (match.actualFinishType === "PENALTIES") return match.penaltyWinnerTeamId;
  if (match.homeScore == null || match.awayScore == null) return null;
  if (match.homeScore === match.awayScore) return null;
  return match.homeScore > match.awayScore ? match.homeTeamId : match.awayTeamId;
}

export function calculateKnockoutBracketPredictionPoints(
  prediction: { picks?: Prisma.JsonValue | Picks; championTeamId?: string },
  actualWinners: Record<string, string | null>
) {
  const picks = pickObject(prediction.picks as Prisma.JsonValue);
  let total = 0;
  let finalistOnePoints = 0;
  let finalistTwoPoints = 0;
  let championPoints = 0;
  const matchPoints: Record<string, number> = {};

  for (const matchNo of PREDICTION_MATCH_NOS) {
    const actualWinner = actualWinners[String(matchNo)];
    const pickedWinner = picks[String(matchNo)];
    const round = MATCH_NO_TO_ROUND.get(matchNo);
    if (!actualWinner || !pickedWinner || !round || actualWinner !== pickedWinner) {
      matchPoints[String(matchNo)] = 0;
      continue;
    }
    matchPoints[String(matchNo)] = round.points;
    total += round.points;
    if (matchNo === 101) finalistOnePoints = round.points;
    if (matchNo === 102) finalistTwoPoints = round.points;
    if (matchNo === 104) championPoints = round.points;
  }

  return { finalistOnePoints, finalistTwoPoints, championPoints, total, matchPoints };
}

export async function getKnockoutBracketDeadline() {
  const firstKnockout = await prisma.match.findFirst({
    where: {
      isKnockout: true,
      stageName: { not: { contains: "3rd" } },
    },
    orderBy: { matchTime: "asc" },
    select: { matchTime: true },
  });
  return firstKnockout?.matchTime ?? null;
}

async function getKnockoutMatchesByNo() {
  const apiIds = Object.keys(WC_2026_BRACKET);
  const matches = await prisma.match.findMany({
    where: { apiMatchId: { in: apiIds }, isKnockout: true },
    select: {
      id: true,
      apiMatchId: true,
      homeTeamId: true,
      awayTeamId: true,
      matchTime: true,
      stageName: true,
      status: true,
      homeScore: true,
      awayScore: true,
      actualFinishType: true,
      penaltyWinnerTeamId: true,
      homeTeam: { select: { id: true, name: true, shortName: true, logoUrl: true } },
      awayTeam: { select: { id: true, name: true, shortName: true, logoUrl: true } },
    },
  });

  const byNo = new Map<number, (typeof matches)[number] & { matchNo: number }>();
  for (const match of matches) {
    const def = WC_2026_BRACKET[match.apiMatchId ?? ""];
    if (!def) continue;
    byNo.set(def.matchNo, { ...match, matchNo: def.matchNo });
  }
  return byNo;
}

export async function getKnockoutBracketTemplate() {
  const byNo = await getKnockoutMatchesByNo();
  const matches = PREDICTION_MATCH_NOS.map((matchNo) => {
    const apiEntry = Object.entries(WC_2026_BRACKET).find(([, def]) => def.matchNo === matchNo);
    const def = apiEntry?.[1];
    const match = byNo.get(matchNo);
    const round = MATCH_NO_TO_ROUND.get(matchNo);
    return {
      matchNo,
      id: match?.id ?? null,
      matchTime: match?.matchTime ?? null,
      stageName: match?.stageName ?? round?.labelEn ?? null,
      points: round?.points ?? 0,
      homeTeam: match?.homeTeam ?? null,
      awayTeam: match?.awayTeam ?? null,
      homeSourceMatchNo: def?.home.type === "WINNER_OF" ? def.home.matchNo : null,
      awaySourceMatchNo: def?.away.type === "WINNER_OF" ? def.away.matchNo : null,
      homeSlotLabel: def ? slotLabel(def.home) : "",
      awaySlotLabel: def ? slotLabel(def.away) : "",
      actualWinnerTeamId: match ? getMatchWinnerTeamId(match) : null,
    };
  });

  return {
    rounds: ROUND_DEFS.map((round) => ({
      key: round.key,
      labelAr: round.labelAr,
      labelEn: round.labelEn,
      points: round.points,
      matchNos: [...round.matchNos],
    })),
    matches,
    maxPoints: ROUND_DEFS.reduce((sum, round) => sum + round.points * round.matchNos.length, 0),
  };
}

async function getActualWinners() {
  const byNo = await getKnockoutMatchesByNo();
  const winners: Record<string, string | null> = {};
  for (const matchNo of PREDICTION_MATCH_NOS) {
    const match = byNo.get(matchNo);
    winners[String(matchNo)] = match ? getMatchWinnerTeamId(match) : null;
  }
  return winners;
}

async function resolveAndValidatePicks(picks: Picks) {
  const template = await getKnockoutBracketTemplate();
  const matchByNo = new Map(template.matches.map((match) => [match.matchNo, match]));
  const resolvedWinners = new Map<number, TeamRef>();

  for (const matchNo of PREDICTION_MATCH_NOS) {
    const match = matchByNo.get(matchNo);
    if (!match) throw new Error("Knockout bracket is not ready yet");

    const homeTeam =
      match.homeSourceMatchNo != null
        ? resolvedWinners.get(match.homeSourceMatchNo) ?? null
        : match.homeTeam;
    const awayTeam =
      match.awaySourceMatchNo != null
        ? resolvedWinners.get(match.awaySourceMatchNo) ?? null
        : match.awayTeam;

    if (!homeTeam || !awayTeam || !isRealTeam(homeTeam) || !isRealTeam(awayTeam)) {
      throw new Error("Round of 32 teams are not ready yet");
    }

    const pickedTeamId = picks[String(matchNo)];
    if (!pickedTeamId) throw new Error("Complete every knockout match");
    if (pickedTeamId !== homeTeam.id && pickedTeamId !== awayTeam.id) {
      throw new Error(`Invalid winner for match ${matchNo}`);
    }

    resolvedWinners.set(matchNo, pickedTeamId === homeTeam.id ? homeTeam : awayTeam);
  }

  const finalistOneTeamId = picks["101"];
  const finalistTwoTeamId = picks["102"];
  const championTeamId = picks["104"];
  if (!finalistOneTeamId || !finalistTwoTeamId || !championTeamId) {
    throw new Error("Complete the semi-finals and final");
  }
  if (championTeamId !== finalistOneTeamId && championTeamId !== finalistTwoTeamId) {
    throw new Error("Champion must be one of your finalists");
  }

  return { finalistOneTeamId, finalistTwoTeamId, championTeamId };
}

export async function recalculateKnockoutBracketPredictionPoints() {
  const actualWinners = await getActualWinners();
  const predictions = await prisma.knockoutBracketPrediction.findMany({
    select: { id: true, picks: true, championTeamId: true },
  });

  for (const prediction of predictions) {
    const points = calculateKnockoutBracketPredictionPoints(prediction, actualWinners);
    await prisma.knockoutBracketPrediction.update({
      where: { id: prediction.id },
      data: {
        finalistOnePoints: points.finalistOnePoints,
        finalistTwoPoints: points.finalistTwoPoints,
        championPoints: points.championPoints,
        totalPoints: points.total,
      },
    });
  }

  try {
    revalidateTag("leaderboard-knockout");
    revalidatePath("/leaderboard/knockout");
  } catch {
    // Cache revalidation is not available in every background context.
  }

  return predictions.length;
}

export async function getKnockoutBracketPredictionStatus(userId: string) {
  const [deadline, template, prediction, actualWinners] = await Promise.all([
    getKnockoutBracketDeadline(),
    getKnockoutBracketTemplate(),
    prisma.knockoutBracketPrediction.findUnique({
      where: { userId },
      include: {
        finalistOneTeam: { select: { id: true, name: true, shortName: true, logoUrl: true } },
        finalistTwoTeam: { select: { id: true, name: true, shortName: true, logoUrl: true } },
        championTeam: { select: { id: true, name: true, shortName: true, logoUrl: true } },
      },
    }),
    getActualWinners(),
  ]);

  const picks = pickObject(prediction?.picks);
  const livePoints = prediction
    ? calculateKnockoutBracketPredictionPoints({ picks, championTeamId: prediction.championTeamId }, actualWinners)
    : null;

  return {
    deadline,
    locked: isLocked(deadline),
    ...template,
    prediction: prediction
      ? {
          ...prediction,
          picks,
          totalPoints: livePoints?.total ?? prediction.totalPoints,
        }
      : null,
    points: livePoints
      ? {
          finalistOnePoints: livePoints.finalistOnePoints,
          finalistTwoPoints: livePoints.finalistTwoPoints,
          championPoints: livePoints.championPoints,
          matchPoints: livePoints.matchPoints,
          total: livePoints.total,
        }
      : null,
  };
}

export async function submitKnockoutBracketPrediction(
  userId: string,
  data: { picks?: Picks }
) {
  const deadline = await getKnockoutBracketDeadline();
  if (!deadline) throw new Error("Knockout matches are not ready yet");
  if (isLocked(deadline)) throw new Error("Knockout bracket prediction is locked");

  const picks = data.picks ?? {};
  const finalistData = await resolveAndValidatePicks(picks);
  const actualWinners = await getActualWinners();
  const points = calculateKnockoutBracketPredictionPoints({ picks }, actualWinners);

  const prediction = await prisma.knockoutBracketPrediction.upsert({
    where: { userId },
    create: {
      userId,
      picks,
      ...finalistData,
      finalistOnePoints: points.finalistOnePoints,
      finalistTwoPoints: points.finalistTwoPoints,
      championPoints: points.championPoints,
      totalPoints: points.total,
    },
    update: {
      picks,
      ...finalistData,
      finalistOnePoints: points.finalistOnePoints,
      finalistTwoPoints: points.finalistTwoPoints,
      championPoints: points.championPoints,
      totalPoints: points.total,
    },
  });

  try {
    revalidateTag("leaderboard-knockout");
    revalidatePath("/knockout-bracket");
    revalidatePath("/leaderboard/knockout");
  } catch {
    // Cache revalidation is not available in every runtime.
  }

  return prediction;
}

async function buildKnockoutLeaderboard(): Promise<LeaderboardEntry[]> {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      knockoutBracketPrediction: { select: { totalPoints: true } },
    },
    orderBy: { username: "asc" },
  });

  const excluded = new Set(["mmg", "mhk", "verifier"]);
  const rows = users
    .filter((user) => !excluded.has(user.username.trim().toLowerCase()))
    .map((user) => ({
      userId: user.id,
      username: user.username,
      points: user.knockoutBracketPrediction?.totalPoints ?? 0,
      rank: 0,
    }))
    .filter((entry) => entry.points > 0 || users.length <= 20)
    .sort((a, b) => (b.points !== a.points ? b.points - a.points : a.username.localeCompare(b.username)));

  rows.forEach((row, index) => {
    row.rank = index + 1;
  });

  return rows;
}

export async function getKnockoutLeaderboard(options?: { fresh?: boolean }) {
  if (options?.fresh) return buildKnockoutLeaderboard();
  return unstable_cache(buildKnockoutLeaderboard, ["knockout-leaderboard"], {
    revalidate: 60,
    tags: ["leaderboard-knockout"],
  })();
}
