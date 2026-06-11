import { apiSuccess, apiError, handleApiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/session";
import { getMatchById } from "@/services/match.service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const includeLineup =
      new URL(request.url).searchParams.get("lineup") === "true";
    const user = await getCurrentUser();
    const match = await getMatchById(id, user?.userId, { includeLineup });

    if (!match) {
      return apiError("Match not found", 404);
    }

    return apiSuccess(match);
  } catch (error) {
    return handleApiError(error);
  }
}
