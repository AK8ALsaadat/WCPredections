import { apiSuccess, handleApiError } from "@/lib/api";
import { getOverallLeaderboard } from "@/services/leaderboard.service";

export async function GET() {
  try {
    const leaderboard = await getOverallLeaderboard({ withTrend: false });
    return apiSuccess(leaderboard, 200, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
