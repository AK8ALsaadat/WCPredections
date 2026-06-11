import { apiSuccess, apiError, handleApiError } from "@/lib/api";
import { getMatchLineup } from "@/services/match.service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const lineup = await getMatchLineup(id);

    if (!lineup) {
      return apiError("Match not found", 404);
    }

    return apiSuccess(lineup);
  } catch (error) {
    return handleApiError(error);
  }
}
