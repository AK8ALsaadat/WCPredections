import { apiSuccess, handleApiError } from "@/lib/api";
import { getKnockoutLeaderboard } from "@/services/knockout-bracket-prediction.service";

export async function GET() {
  try {
    const leaderboard = await getKnockoutLeaderboard({ fresh: true });
    return apiSuccess(leaderboard, 200, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
