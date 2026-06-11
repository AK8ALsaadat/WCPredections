import { apiSuccess, handleApiError } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { parseBody, syncMatchesSchema } from "@/lib/validations";
import { syncMatchesFromApi } from "@/services/football-api";
import { syncActiveRoundFromApi } from "@/services/sync.service";

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = await request.json().catch(() => ({}));

    if (!body.roundId) {
      const result = await syncActiveRoundFromApi();
      return apiSuccess(result);
    }

    const data = parseBody(syncMatchesSchema, body);

    const result = await syncMatchesFromApi(data.roundId, {
      leagueId: data.leagueId ?? process.env.FOOTBALL_LEAGUE_ID,
      season: data.season ?? process.env.FOOTBALL_SEASON,
      dateFrom: data.dateFrom,
      dateTo: data.dateTo,
    });

    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}
