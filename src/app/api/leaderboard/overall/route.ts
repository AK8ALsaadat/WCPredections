import { apiSuccess, handleApiError } from "@/lib/api";
import { getOverallLeaderboard } from "@/services/leaderboard.service";

export async function GET() {
  try {
    const leaderboard = await getOverallLeaderboard();
    return apiSuccess(leaderboard, 200, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
