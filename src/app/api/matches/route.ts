/* eslint-disable @typescript-eslint/no-explicit-any */
import { apiSuccess, handleApiError } from "@/lib/api";
import {
  paginateSchedule,
  SCHEDULE_PAGE_SIZE,
} from "@/lib/schedule-pagination";
import { getCurrentUser } from "@/lib/session";
import {
  getUpcomingMatches,
  getAllMatches,
  getCompletedMatches,
  getScheduleMatches,
  getUserPinnedTodayMatches,
  enrichMatchesWithUserPredictions,
} from "@/services/match.service";
import { syncLiveMatchesFreshQuick } from "@/services/live-scoring.service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const light = searchParams.get("light") === "1";
    const completed = searchParams.get("completed") === "true";
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

    void syncLiveMatchesFreshQuick().catch(() => {});

    const raw = completed
      ? await getCompletedMatches(roundId)
      : schedule
        ? await getScheduleMatches(roundId)
        : upcoming
          ? await getUpcomingMatches(roundId)
          : await getAllMatches(roundId);

    if ((schedule || completed) && paginated) {
      const { items, meta } = paginateSchedule(raw, page, pageSize);
      
      if (light && !completed) {
        const matches = await enrichMatchesWithUserPredictions(items, user?.userId);
        return apiSuccess({ matches, pinnedMatches: [], ...meta });
      }
      
      const matches = await enrichMatchesWithUserPredictions(items, user?.userId);
      const pinnedMatches =
        user?.userId && page === 1
          ? await getUserPinnedTodayMatches(user.userId, roundId)
          : [];
      return apiSuccess({ matches, pinnedMatches, ...meta });
    }

    if (light && !completed) {
      const lite = raw.map((m: any) => ({
        id: m.id,
        matchTime: m.matchTime,
        status: m.status,
        homeScore: m.homeScore ?? null,
        awayScore: m.awayScore ?? null,
        isKnockout: m.isKnockout,
        stageName: m.stageName,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        round: m.round,
        actualFinishType: m.actualFinishType ?? null,
        penaltyWinnerTeamId: m.penaltyWinnerTeamId ?? null,
      }));
      return apiSuccess(lite, 200, { headers: { "Cache-Control": "private, no-cache" } });
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
