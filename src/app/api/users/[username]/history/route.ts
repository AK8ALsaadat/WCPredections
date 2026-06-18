import { prisma } from "@/lib/prisma";
import { apiSuccess, handleApiError } from "@/lib/api";
import { buildMatchHistoryEntries } from "@/lib/profile-history";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;

    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      return apiSuccess({
        user: null,
        history: {
          predictions: [],
          scorerPredictions: [],
          boldScorerBets: [],
          octopusBets: [],
        },
      });
    }

    const matches = await prisma.match.findMany({
      where: {
        status: "FINISHED",
        homeScore: { not: null },
        awayScore: { not: null },
        OR: [
          { predictions: { some: { userId: user.id } } },
          { scorerPredictions: { some: { userId: user.id } } },
          { boldScorerBets: { some: { userId: user.id } } },
          { octopusBets: { some: { userId: user.id } } },
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
              },
            },
          },
        }),
        prisma.boldScorerBet.findMany({
          where: { userId: user.id, matchId: { in: matchIds } },
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
          where: { userId: user.id, matchId: { in: matchIds } },
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
    const history = {
      predictions,
      scorerPredictions,
      boldScorerBets,
      octopusBets,
    };

    // تحويل البيانات ليطابقها النوع المتوقع (matchTime: string)
    const formattedHistory = {
      predictions: history.predictions.map(p => ({
        ...p,
        match: {
          ...p.match,
          matchTime: p.match.matchTime.toISOString(),
        },
      })),
      scorerPredictions: history.scorerPredictions.map(sp => ({
        ...sp,
        match: {
          ...sp.match,
          matchTime: sp.match.matchTime.toISOString(),
        },
      })),
      boldScorerBets: history.boldScorerBets.map(b => ({
        ...b,
        match: {
          ...b.match,
          matchTime: b.match.matchTime.toISOString(),
        },
      })),
      octopusBets: history.octopusBets.map(b => ({
        ...b,
        match: {
          ...b.match,
          matchTime: b.match.matchTime.toISOString(),
        },
      })),
    };

    const allEntries = buildMatchHistoryEntries(formattedHistory);

    const entries = allEntries.slice(0, 5);

    return apiSuccess({
      user: {
        id: user.id,
        username: user.username,
      },
      history: entries,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
