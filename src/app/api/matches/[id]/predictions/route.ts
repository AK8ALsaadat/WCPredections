import { apiSuccess, apiError, handleApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { getLeagueMatchPredictions } from "@/services/prediction.service";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const data = await getLeagueMatchPredictions(id);

    if (!data) {
      return apiError("Match not found", 404);
    }

    return apiSuccess({ ...data, currentUserId: user.userId }, 200, {
      headers: {
        "Cache-Control": "private, max-age=15, stale-while-revalidate=45",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Predictions still open") {
      return apiError(error.message, 403);
    }
    return handleApiError(error);
  }
}
