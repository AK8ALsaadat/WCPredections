import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { apiSuccess, handleApiError } from "@/lib/api";
import { buildMatchHistoryEntries } from "@/lib/profile-history";

async function fetchUserHistory(username: string) {
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true },
  });

  if (!user) {
    return {
      user: null,
      history: [],
    };
  }

  const matches = await prisma.match.findMany({
    where: {
      status: "FINISHED",
      homeScore: { not: null },
      awayScore: { not: null },
      OR: [
        { predictions: { some: { userId: user.id } } },
        { scorerPredictions: { some: { userId: user.id } } },
        { boldScorerBets: { some: { userId: user.id, cancelledAt: null } } },
        { octopusBets: { some: { userId: user.id, cancelledAt: null } } },
      ],
    },
    include: {
      homeTeam: true,
      awayTeam: true,
      round: true,
    },
    orderBy: { matchTime: "desc" },
    take: 5,
  });
  const matchIds = matches.map((match) => match.id);

  const [predictions, scorerPredictions, boldScorerBets, octopusBets] =
    await Promise.all([
      prisma.prediction.findMany({
        where: { userId: user.id, matchId: { in: matchIds } },
        include: {
          match: {
            include: {
              homeTeam: true,
              awayTeam: true,
              round: true,
            },
          },
        },
      }),
      prisma.scorerPrediction.findMany({
        where: { userId: user.id, matchId: { in: matchIds } },
        include: {
          player: true,
          match: {
            include: {
              homeTeam: true,
              awayTeam: true,
              round: true,
              goalkeeperStats: {
                select: { playerId: true, saves: true },
              },
            },
          },
        },
      }),
      prisma.boldScorerBet.findMany({
        where: {
          userId: user.id,
          matchId: { in: matchIds },
          cancelledAt: null,
        },
        include: {
          player: true,
          match: {
            include: {
              homeTeam: true,
              awayTeam: true,
              round: true,
            },
          },
        },
      }),
      prisma.octopusGoalkeeperBet.findMany({
        where: {
          userId: user.id,
          matchId: { in: matchIds },
          cancelledAt: null,
        },
        include: {
          player: true,
          match: {
            include: {
              homeTeam: true,
              awayTeam: true,
              round: true,
            },
          },
        },
      }),
    ]);

  const formattedHistory = {
    predictions: predictions.map((p) => ({
      ...p,
      match: {
        ...p.match,
        matchTime: p.match.matchTime.toISOString(),
      },
    })),
    scorerPredictions: scorerPredictions.map((sp) => ({
      ...sp,
      match: {
        ...sp.match,
        matchTime: sp.match.matchTime.toISOString(),
      },
    })),
    boldScorerBets: boldScorerBets.map((b) => ({
      ...b,
      match: {
        ...b.match,
        matchTime: b.match.matchTime.toISOString(),
      },
    })),
    octopusBets: octopusBets.map((b) => ({
      ...b,
      match: {
        ...b.match,
        matchTime: b.match.matchTime.toISOString(),
      },
    })),
  };

  return {
    user,
    history: buildMatchHistoryEntries(formattedHistory).slice(0, 5),
  };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;
    const data = await unstable_cache(
      () => fetchUserHistory(username),
      ["public-user-history", username],
      { revalidate: 60 }
    )();

    return apiSuccess(data, 200, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
