import { apiSuccess, apiError, handleApiError } from "@/lib/api";
import { getMatchLineup } from "@/services/match.service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const fresh = new URL(request.url).searchParams.get("fresh") === "1";
    const lineup = await getMatchLineup(id, { fresh });

    if (!lineup) {
      return apiError("Match not found", 404);
    }

    const cacheControl =
      lineup.lineupStatus === "official"
        ? "private, max-age=180, stale-while-revalidate=300"
        : "private, max-age=30, stale-while-revalidate=60";

    return apiSuccess(lineup, 200, {
      headers: {
        "Cache-Control": cacheControl,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
