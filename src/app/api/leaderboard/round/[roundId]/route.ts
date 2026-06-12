import { apiSuccess, handleApiError } from "@/lib/api";
import { getRoundLeaderboard } from "@/services/leaderboard.service";
import { syncLiveMatchesFreshQuick } from "@/services/live-scoring.service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ roundId: string }> }
) {
  try {
    const { roundId } = await params;
    void syncLiveMatchesFreshQuick().catch(() => {});
    const leaderboard = await getRoundLeaderboard(roundId, { fresh: true });
    return apiSuccess(leaderboard, 200, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
