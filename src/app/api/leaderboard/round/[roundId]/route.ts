import { apiSuccess, handleApiError } from "@/lib/api";
import { getRoundLeaderboard } from "@/services/leaderboard.service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ roundId: string }> }
) {
  try {
    const { roundId } = await params;
    const leaderboard = await getRoundLeaderboard(roundId);
    return apiSuccess(leaderboard);
  } catch (error) {
    return handleApiError(error);
  }
}
