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

export const FINALIST_PREDICTION_POINTS = 3;
export const CHAMPION_PREDICTION_POINTS = 10;

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
type FinalistsPredictionInput = {
  picks?: Prisma.JsonValue | Picks;
  finalistOneTeamId?: string | null;
  finalistTwoTeamId?: string | null;
  championTeamId?: string | null;
};
type ActualFinalResult = {
  finalistTeamIds?: string[];
  championTeamId?: string | null;
};
type ActualWinnersInput = Record<string, string | null> | ActualFinalResult;

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

function actualFinalResultFromInput(actual: ActualWinnersInput): ActualFinalResult {
  if ("finalistTeamIds" in actual || "championTeamId" in actual) {
    const finalResult = actual as ActualFinalResult;
    return {
      finalistTeamIds: Array.isArray(finalResult.finalistTeamIds)
        ? finalResult.finalistTeamIds
        : [],
      championTeamId:
        typeof finalResult.championTeamId === "string"
          ? finalResult.championTeamId
          : null,
    };
  }

  const winnerMap = actual as Record<string, string | null>;
  return {
    finalistTeamIds: [winnerMap["101"], winnerMap["102"]].filter(
      (teamId): teamId is string => Boolean(teamId)
    ),
    championTeamId: winnerMap["104"] ?? null,
  };
}

export function calculateKnockoutBracketPredictionPoints(
  prediction: FinalistsPredictionInput,
  actualWinners: ActualWinnersInput
) {
  const picks = pickObject(prediction.picks as Prisma.JsonValue);
  let bracketTotal = 0;
  let finalistOnePoints = 0;
  let finalistTwoPoints = 0;
  let championPoints = 0;
  const matchPoints: Record<string, number> = {};

  for (const matchNo of PREDICTION_MATCH_NOS) {
    const actualWinner =
      (actualWinners as Record<string, string | null>)[String(matchNo)] ?? null;
    const pickedWinner = picks[String(matchNo)];
    const round = MATCH_NO_TO_ROUND.get(matchNo);
    if (!actualWinner || !pickedWinner || !round || actualWinner !== pickedWinner) {
      matchPoints[String(matchNo)] = 0;
      continue;
    }
    matchPoints[String(matchNo)] = round.points;
    bracketTotal += round.points;
  }

  const finalistOneTeamId = prediction.finalistOneTeamId ?? picks["101"];
  const finalistTwoTeamId = prediction.finalistTwoTeamId ?? picks["102"];
  const championTeamId = prediction.championTeamId ?? picks["104"];
  const actualFinal = actualFinalResultFromInput(actualWinners);
  const actualFinalists = new Set(actualFinal.finalistTeamIds ?? []);

  if (finalistOneTeamId && actualFinalists.has(finalistOneTeamId)) {
    finalistOnePoints = FINALIST_PREDICTION_POINTS;
  }
  if (finalistTwoTeamId && actualFinalists.has(finalistTwoTeamId)) {
    finalistTwoPoints = FINALIST_PREDICTION_POINTS;
  }
  if (championTeamId && actualFinal.championTeamId === championTeamId) {
    championPoints = CHAMPION_PREDICTION_POINTS;
  }

  const total = finalistOnePoints + finalistTwoPoints + championPoints;

  return {
    finalistOnePoints,
    finalistTwoPoints,
    championPoints,
    total,
    matchPoints,
    bracketTotal,
  };
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

async function getActualFinalResultFromDatabase(): Promise<ActualFinalResult> {
  const finalMatch = await prisma.match.findFirst({
    where: {
      isKnockout: true,
      NOT: [
        { stageName: { contains: "Third" } },
        { stageName: { contains: "3rd" } },
      ],
      OR: [
        { stageName: { contains: "Final" } },
        { apiMatchId: "537390" },
      ],
    },
    include: {
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
    },
    orderBy: { matchTime: "desc" },
  });

  if (!finalMatch) return { finalistTeamIds: [], championTeamId: null };

  const finalistTeamIds = [finalMatch.homeTeam, finalMatch.awayTeam]
    .filter(isRealTeam)
    .map((team) => team.id);

  return {
    finalistTeamIds,
    championTeamId: getMatchWinnerTeamId(finalMatch),
  };
}

async function getKnockoutFinalistCandidates(): Promise<TeamRef[]> {
  const rows = await prisma.match.findMany({
    where: { isKnockout: true },
    select: {
      matchTime: true,
      homeTeam: { select: { id: true, name: true, shortName: true, logoUrl: true } },
      awayTeam: { select: { id: true, name: true, shortName: true, logoUrl: true } },
    },
    orderBy: { matchTime: "asc" },
  });

  const unique = new Map<string, TeamRef>();
  for (const row of rows) {
    for (const team of [row.homeTeam, row.awayTeam]) {
      if (!isRealTeam(team)) continue;
      unique.set(team.id, team);
    }
  }

  return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name));
}

async function validateSimpleFinalistsPrediction(picks: Picks) {
  const finalistOneTeamId = picks["101"];
  const finalistTwoTeamId = picks["102"];
  const championTeamId = picks["104"];
  if (!finalistOneTeamId || !finalistTwoTeamId || !championTeamId) {
    throw new Error("Choose both finalists and the champion");
  }
  if (finalistOneTeamId === finalistTwoTeamId) {
    throw new Error("Choose two different finalists");
  }
  if (championTeamId !== finalistOneTeamId && championTeamId !== finalistTwoTeamId) {
    throw new Error("Champion must be one of your finalists");
  }

  const candidates = await getKnockoutFinalistCandidates();
  const candidateIds = new Set(candidates.map((team) => team.id));
  if (
    candidateIds.size > 0 &&
    (!candidateIds.has(finalistOneTeamId) ||
      !candidateIds.has(finalistTwoTeamId) ||
      !candidateIds.has(championTeamId))
  ) {
    throw new Error("Choose teams from the knockout teams list");
  }

  return { finalistOneTeamId, finalistTwoTeamId, championTeamId };
}

async function resolveAndValidatePicks(picks: Picks) {
  const hasCompleteBracket = PREDICTION_MATCH_NOS.every(
    (matchNo) => Boolean(picks[String(matchNo)])
  );

  if (!hasCompleteBracket) {
    return validateSimpleFinalistsPrediction(picks);
  }

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
  const [actualWinners, actualFinalResult] = await Promise.all([
    getActualWinners(),
    getActualFinalResultFromDatabase(),
  ]);
  const predictions = await prisma.knockoutBracketPrediction.findMany({
    select: {
      id: true,
      picks: true,
      finalistOneTeamId: true,
      finalistTwoTeamId: true,
      championTeamId: true,
    },
  });

  for (const prediction of predictions) {
    const points = calculateKnockoutBracketPredictionPoints(
      prediction,
      { ...actualWinners, ...actualFinalResult }
    );
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
  const [deadline, template, prediction, actualWinners, actualFinalResult, finalistCandidates] = await Promise.all([
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
    getActualFinalResultFromDatabase(),
    getKnockoutFinalistCandidates(),
  ]);

  const picks = pickObject(prediction?.picks);
  const livePoints = prediction
    ? calculateKnockoutBracketPredictionPoints(
        {
          picks,
          finalistOneTeamId: prediction.finalistOneTeamId,
          finalistTwoTeamId: prediction.finalistTwoTeamId,
          championTeamId: prediction.championTeamId,
        },
        { ...actualWinners, ...actualFinalResult }
      )
    : null;

  return {
    deadline,
    locked: isLocked(deadline),
    finalistCandidates,
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
          bracketTotal: livePoints.bracketTotal,
        }
      : null,
  };
}

export async function submitKnockoutBracketPrediction(
  userId: string,
  data: {
    picks?: Picks;
    finalistOneTeamId?: string | null;
    finalistTwoTeamId?: string | null;
    championTeamId?: string | null;
  }
) {
  const deadline = await getKnockoutBracketDeadline();
  if (!deadline) throw new Error("Knockout matches are not ready yet");
  if (isLocked(deadline)) throw new Error("Knockout bracket prediction is locked");

  const picks = data.picks ?? {
    "101": data.finalistOneTeamId ?? "",
    "102": data.finalistTwoTeamId ?? "",
    "104": data.championTeamId ?? "",
  };
  const finalistData = await resolveAndValidatePicks(picks);
  const [actualWinners, actualFinalResult] = await Promise.all([
    getActualWinners(),
    getActualFinalResultFromDatabase(),
  ]);
  const points = calculateKnockoutBracketPredictionPoints(
    { picks, ...finalistData },
    { ...actualWinners, ...actualFinalResult }
  );

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
    revalidatePath("/matches");
    revalidatePath("/dashboard");
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
