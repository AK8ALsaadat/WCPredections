import { apiSuccess, handleApiError } from "@/lib/api";
import { getOverallLeaderboard } from "@/services/leaderboard.service";

export async function GET() {
  try {
    const leaderboard = await getOverallLeaderboard({
      withTrend: false,
    });
    return apiSuccess(leaderboard, 200, {
      headers: {
        "Cache-Control": "private, max-age=15, stale-while-revalidate=45",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
