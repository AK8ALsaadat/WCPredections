import { revalidatePath, revalidateTag } from "next/cache";
import { updateUserUsername } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiSuccess, handleApiError } from "@/lib/api";
import { getSession, requireAuth } from "@/lib/session";
import { parseBody, updateUsernameSchema } from "@/lib/validations";
import { getUserTotalPoints } from "@/services/leaderboard.service";
import { getUserPredictionHistory } from "@/services/prediction.service";

export async function GET() {
  try {
    const sessionUser = await requireAuth();
    const [user, totalPoints, history] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: sessionUser.userId },
        select: { id: true, username: true, createdAt: true },
      }),
      getUserTotalPoints(sessionUser.userId),
      getUserPredictionHistory(sessionUser.userId),
    ]);

    const roundPoints: Record<string, number> = {};
    for (const p of history.predictions) {
      const roundId = p.match.round.id;
      const pts =
        p.points +
        p.doubleBonus +
        p.finishTypePoints +
        p.penaltyWinnerPoints;
      roundPoints[roundId] = (roundPoints[roundId] ?? 0) + pts;
    }
    for (const sp of history.scorerPredictions) {
      const roundId = sp.match.round.id;
      roundPoints[roundId] = (roundPoints[roundId] ?? 0) + sp.points;
    }
    for (const bet of history.boldScorerBets) {
      roundPoints[bet.roundId] = (roundPoints[bet.roundId] ?? 0) + bet.points;
    }

    const correctPredictions = history.predictions.filter(
      (p) => p.points > 0
    ).length;

    return apiSuccess(
      {
        ...user,
        totalPoints,
        roundPoints,
        predictionsCount: history.predictions.length,
        correctPredictions,
        history,
      },
      200,
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const sessionUser = await requireAuth();
    const body = await request.json();
    const data = parseBody(updateUsernameSchema, body);

    const updated = await updateUserUsername(sessionUser.userId, data.username);

    const session = await getSession();
    session.user = updated;
    await session.save();

    revalidateTag("leaderboard-overall");
    revalidatePath("/leaderboard", "layout");
    revalidatePath("/dashboard");

    return apiSuccess({ user: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
