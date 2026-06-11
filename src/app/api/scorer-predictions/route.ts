import { prisma } from "@/lib/prisma";
import { apiSuccess, handleApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { getPredictionLockReason } from "@/lib/utils";
import { parseBody, scorerPredictionSchema } from "@/lib/validations";
import { submitScorerPredictions } from "@/services/prediction.service";

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const data = parseBody(scorerPredictionSchema, body);

    const predictions = await submitScorerPredictions(
      user.userId,
      data.matchId,
      data.picks
    );

    return apiSuccess(predictions, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(request.url);
    const matchId = searchParams.get("matchId");

    if (!matchId) {
      throw new Error("matchId is required");
    }

    const match = await prisma.match.findUniqueOrThrow({
      where: { id: matchId },
      select: { matchTime: true },
    });
    const lockReason = getPredictionLockReason(match.matchTime);
    if (lockReason) {
      throw new Error(lockReason);
    }

    await prisma.scorerPrediction.deleteMany({
      where: { userId: user.userId, matchId },
    });

    return apiSuccess({ message: "Scorer predictions cleared" });
  } catch (error) {
    return handleApiError(error);
  }
}
