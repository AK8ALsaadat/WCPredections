import { apiSuccess, apiError, handleApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { ensureLiveMatchScoringFresh } from "@/services/live-scoring.service";
import { getLeagueMatchPredictions } from "@/services/prediction.service";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id } = await params;
    void ensureLiveMatchScoringFresh(id);
    const data = await getLeagueMatchPredictions(id);

    if (!data) {
      return apiError("Match not found", 404);
    }

    return apiSuccess(data, 200, {
      headers: {
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Predictions still open") {
      return apiError(error.message, 403);
    }
    return handleApiError(error);
  }
}
