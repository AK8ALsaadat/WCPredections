import { apiSuccess, handleApiError } from "@/lib/api";
import {
  paginateSchedule,
  SCHEDULE_PAGE_SIZE,
} from "@/lib/schedule-pagination";
import { getCurrentUser } from "@/lib/session";
import { syncStalePredictedMatches } from "@/services/football-api";
import {
  getUpcomingMatches,
  getAllMatches,
  getScheduleMatches,
  getUserPinnedTodayMatches,
  enrichMatchesWithUserPredictions,
} from "@/services/match.service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const roundId = searchParams.get("roundId") ?? undefined;
    const upcoming = searchParams.get("upcoming") === "true";
    const schedule = searchParams.get("schedule") === "true";
    const paginated = searchParams.get("paginated") === "true";
    const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const pageSize = Math.min(
      24,
      Math.max(1, Number.parseInt(searchParams.get("pageSize") ?? String(SCHEDULE_PAGE_SIZE), 10) || SCHEDULE_PAGE_SIZE)
    );

    const user = await getCurrentUser();

    if (schedule) {
      await syncStalePredictedMatches(roundId);
    }

    const raw = schedule
      ? await getScheduleMatches(roundId)
      : upcoming
        ? await getUpcomingMatches(roundId)
        : await getAllMatches(roundId);

    if (schedule && paginated) {
      const { items, meta } = paginateSchedule(raw, page, pageSize);
      const matches = await enrichMatchesWithUserPredictions(items, user?.userId);
      const pinnedMatches =
        user?.userId && page === 1
          ? await getUserPinnedTodayMatches(user.userId, roundId)
          : [];
      return apiSuccess({ matches, pinnedMatches, ...meta });
    }

    const matches = await enrichMatchesWithUserPredictions(raw, user?.userId);

    return apiSuccess(matches, 200, {
      headers: {
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
