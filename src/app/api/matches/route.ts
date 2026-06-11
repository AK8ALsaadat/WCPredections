import { apiSuccess, handleApiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/session";
import {
  getUpcomingMatches,
  getAllMatches,
  getScheduleMatches,
  enrichMatchesWithUserPredictions,
} from "@/services/match.service";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const roundId = searchParams.get("roundId") ?? undefined;
    const upcoming = searchParams.get("upcoming") === "true";
    const schedule = searchParams.get("schedule") === "true";

    const user = await getCurrentUser();
    const raw = schedule
      ? await getScheduleMatches(roundId)
      : upcoming
        ? await getUpcomingMatches(roundId)
        : await getAllMatches(roundId);

    const matches = await enrichMatchesWithUserPredictions(raw, user?.userId);

    return apiSuccess(matches);
  } catch (error) {
    return handleApiError(error);
  }
}
