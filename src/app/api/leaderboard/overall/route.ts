import { apiSuccess, handleApiError } from "@/lib/api";
import { getOverallLeaderboard } from "@/services/leaderboard.service";
import { syncLiveMatchesFreshQuick } from "@/services/live-scoring.service";

export async function GET() {
  try {
    void syncLiveMatchesFreshQuick().catch(() => {});
    const leaderboard = await getOverallLeaderboard({ fresh: true });
    return apiSuccess(leaderboard, 200, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
