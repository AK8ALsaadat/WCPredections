import { revalidatePath, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { normalizeTeamIdentity } from "@/lib/team-identity";

export const FINALIST_POINTS = 3;
export const CHAMPION_POINTS = 10;

type TeamRef = { id: string; name: string; shortName: string; logoUrl: string | null };

function isRealTeam(team: Pick<TeamRef, "name">) {
  const identity = normalizeTeamIdentity(team.name);
  return Boolean(identity && identity !== "tbd" && !identity.includes("to be"));
}

function uniqueTeams(teams: TeamRef[]) {
  const byIdentity = new Map<string, TeamRef>();
  for (const team of teams) {
    if (!isRealTeam(team)) continue;
    const identity = normalizeTeamIdentity(team.name);
    const existing = byIdentity.get(identity);
    if (
      !existing ||
      (team.shortName.length <= 4 && existing.shortName.length > 4) ||
      (team.logoUrl && !existing.logoUrl)
    ) {
      byIdentity.set(identity, team);
    }
  }
  return Array.from(byIdentity.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function isLocked(deadline: Date | null, now = new Date()) {
  return deadline != null && now >= deadline;
}

export function calculateKnockoutBracketPredictionPoints(
  prediction: {
    finalistOneTeamId: string;
    finalistTwoTeamId: string;
    championTeamId: string;
  },
  actual: { finalistTeamIds: string[]; championTeamId: string | null }
) {
  const actualFinalists = new Set(actual.finalistTeamIds);
  const finalistOnePoints = actualFinalists.has(prediction.finalistOneTeamId)
    ? FINALIST_POINTS
    : 0;
  const finalistTwoPoints = actualFinalists.has(prediction.finalistTwoTeamId)
    ? FINALIST_POINTS
    : 0;
  const championPoints =
    actual.championTeamId && prediction.championTeamId === actual.championTeamId
      ? CHAMPION_POINTS
      : 0;

  return {
    finalistOnePoints,
    finalistTwoPoints,
    championPoints,
    total: finalistOnePoints + finalistTwoPoints + championPoints,
  };
}

export async function getKnockoutBracketDeadline() {
  const firstKnockout = await prisma.match.findFirst({
    where: {
      isKnockout: true,
      homeTeam: { name: { not: "يُحدد لاحقاً" } },
      awayTeam: { name: { not: "يُحدد لاحقاً" } },
    },
    orderBy: { matchTime: "asc" },
    select: { matchTime: true },
  });
  return firstKnockout?.matchTime ?? null;
}

export async function getKnockoutBracketTeams() {
  const knockoutMatches = await prisma.match.findMany({
    where: { isKnockout: true },
    orderBy: [{ matchTime: "asc" }, { id: "asc" }],
    select: {
      homeTeam: { select: { id: true, name: true, shortName: true, logoUrl: true } },
      awayTeam: { select: { id: true, name: true, shortName: true, logoUrl: true } },
    },
  });

  const knockoutTeams = uniqueTeams(
    knockoutMatches.flatMap((match) => [match.homeTeam, match.awayTeam])
  );
  if (knockoutTeams.length >= 4) return knockoutTeams;

  const playedTeams = await prisma.match.findMany({
    where: {
      isKnockout: false,
      status: { in: ["LIVE", "FINISHED", "SCHEDULED"] },
    },
    orderBy: [{ matchTime: "asc" }, { id: "asc" }],
    select: {
      homeTeam: { select: { id: true, name: true, shortName: true, logoUrl: true } },
      awayTeam: { select: { id: true, name: true, shortName: true, logoUrl: true } },
    },
  });

  return uniqueTeams(playedTeams.flatMap((match) => [match.homeTeam, match.awayTeam]));
}

async function getFinalMatch() {
  const explicitFinal = await prisma.match.findFirst({
    where: {
      isKnockout: true,
      OR: [{ stageName: "Final" }, { stageName: { contains: "Final" } }],
      NOT: [{ stageName: { contains: "3rd" } }, { stageName: { contains: "Third" } }],
    },
    orderBy: { matchTime: "desc" },
    select: {
      id: true,
      status: true,
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
      actualFinishType: true,
      penaltyWinnerTeamId: true,
    },
  });
  if (explicitFinal) return explicitFinal;

  return prisma.match.findFirst({
    where: { isKnockout: true },
    orderBy: { matchTime: "desc" },
    select: {
      id: true,
      status: true,
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
      actualFinishType: true,
      penaltyWinnerTeamId: true,
    },
  });
}

export async function getActualKnockoutBracketResult() {
  const finalMatch = await getFinalMatch();
  if (!finalMatch || finalMatch.status !== "FINISHED") {
    return { finalistTeamIds: [], championTeamId: null as string | null };
  }

  let championTeamId: string | null = null;
  if (finalMatch.actualFinishType === "PENALTIES") {
    championTeamId = finalMatch.penaltyWinnerTeamId;
  } else if (
    finalMatch.homeScore != null &&
    finalMatch.awayScore != null &&
    finalMatch.homeScore !== finalMatch.awayScore
  ) {
    championTeamId =
      finalMatch.homeScore > finalMatch.awayScore
        ? finalMatch.homeTeamId
        : finalMatch.awayTeamId;
  }

  return {
    finalistTeamIds: [finalMatch.homeTeamId, finalMatch.awayTeamId],
    championTeamId,
  };
}

export async function recalculateKnockoutBracketPredictionPoints() {
  const actual = await getActualKnockoutBracketResult();
  if (actual.finalistTeamIds.length !== 2 || !actual.championTeamId) return 0;

  const predictions = await prisma.knockoutBracketPrediction.findMany({
    select: {
      id: true,
      finalistOneTeamId: true,
      finalistTwoTeamId: true,
      championTeamId: true,
    },
  });

  for (const prediction of predictions) {
    const points = calculateKnockoutBracketPredictionPoints(prediction, actual);
    await prisma.knockoutBracketPrediction.update({
      where: { id: prediction.id },
      data: {
        finalistOnePoints: points.finalistOnePoints,
        finalistTwoPoints: points.finalistTwoPoints,
        championPoints: points.championPoints,
      },
    });
  }

  try {
    revalidateTag("leaderboard-overall");
    revalidatePath("/leaderboard", "layout");
    revalidatePath("/profile");
  } catch {
    // Cache revalidation is not available in every background context.
  }

  return predictions.length;
}

export async function getKnockoutBracketPredictionStatus(userId: string) {
  const [deadline, teams, prediction, actual] = await Promise.all([
    getKnockoutBracketDeadline(),
    getKnockoutBracketTeams(),
    prisma.knockoutBracketPrediction.findUnique({
      where: { userId },
      include: {
        finalistOneTeam: { select: { id: true, name: true, shortName: true, logoUrl: true } },
        finalistTwoTeam: { select: { id: true, name: true, shortName: true, logoUrl: true } },
        championTeam: { select: { id: true, name: true, shortName: true, logoUrl: true } },
      },
    }),
    getActualKnockoutBracketResult(),
  ]);

  return {
    deadline,
    locked: isLocked(deadline),
    teams,
    prediction,
    actual,
    points: prediction
      ? {
          finalistOnePoints: prediction.finalistOnePoints,
          finalistTwoPoints: prediction.finalistTwoPoints,
          championPoints: prediction.championPoints,
          total:
            prediction.finalistOnePoints +
            prediction.finalistTwoPoints +
            prediction.championPoints,
        }
      : null,
  };
}

export async function submitKnockoutBracketPrediction(
  userId: string,
  data: {
    finalistOneTeamId: string;
    finalistTwoTeamId: string;
    championTeamId: string;
  }
) {
  const deadline = await getKnockoutBracketDeadline();
  if (!deadline) throw new Error("Knockout matches are not ready yet");
  if (isLocked(deadline)) {
    throw new Error("Knockout bracket prediction is locked");
  }
  if (data.finalistOneTeamId === data.finalistTwoTeamId) {
    throw new Error("Choose two different finalists");
  }
  if (
    data.championTeamId !== data.finalistOneTeamId &&
    data.championTeamId !== data.finalistTwoTeamId
  ) {
    throw new Error("Champion must be one of your finalists");
  }

  const teams = await getKnockoutBracketTeams();
  const teamIds = new Set(teams.map((team) => team.id));
  for (const teamId of [
    data.finalistOneTeamId,
    data.finalistTwoTeamId,
    data.championTeamId,
  ]) {
    if (!teamIds.has(teamId)) throw new Error("Invalid knockout team");
  }

  const prediction = await prisma.knockoutBracketPrediction.upsert({
    where: { userId },
    create: {
      userId,
      finalistOneTeamId: data.finalistOneTeamId,
      finalistTwoTeamId: data.finalistTwoTeamId,
      championTeamId: data.championTeamId,
    },
    update: {
      finalistOneTeamId: data.finalistOneTeamId,
      finalistTwoTeamId: data.finalistTwoTeamId,
      championTeamId: data.championTeamId,
      finalistOnePoints: 0,
      finalistTwoPoints: 0,
      championPoints: 0,
    },
  });

  return prediction;
}
