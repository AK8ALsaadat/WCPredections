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

    const cacheControl = fresh
      ? "private, no-store"
      : lineup.lineupStatus === "official"
        ? "public, max-age=60, s-maxage=180, stale-while-revalidate=300"
        : "public, max-age=60, s-maxage=300, stale-while-revalidate=900";

    return apiSuccess(lineup, 200, {
      headers: {
        "Cache-Control": cacheControl,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
