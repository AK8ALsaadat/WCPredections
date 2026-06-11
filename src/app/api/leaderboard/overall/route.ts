import { apiSuccess, handleApiError } from "@/lib/api";
import { getOverallLeaderboard } from "@/services/leaderboard.service";

export async function GET() {
  try {
    const leaderboard = await getOverallLeaderboard();
    return apiSuccess(leaderboard);
  } catch (error) {
    return handleApiError(error);
  }
}
