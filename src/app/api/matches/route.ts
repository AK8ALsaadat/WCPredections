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
  prewarmFastMatchLineups,
} from "@/services/match.service";

export const dynamic = "force-dynamic";

const PRIVATE_SHORT_CACHE = {
  headers: {
    "Cache-Control": "private, max-age=15, stale-while-revalidate=45",
  },
} satisfies ResponseInit;

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

    const rawPromise = completed
      ? getCompletedMatches(roundId)
      : schedule
        ? getScheduleMatches(roundId)
        : upcoming
          ? getUpcomingMatches(roundId)
          : getAllMatches(roundId);
    const [user, raw] = await Promise.all([
      getCurrentUser(),
      rawPromise,
    ]);

    if ((schedule || upcoming || completed) && paginated) {
      const { items, meta } = paginateSchedule(raw, page, pageSize);
      
      if (light && !completed) {
        const matches = await enrichMatchesWithUserPredictions(items, user?.userId);
        prewarmFastMatchLineups(matches.map((match) => match.id));
        return apiSuccess({ matches, pinnedMatches: [], ...meta }, 200, PRIVATE_SHORT_CACHE);
      }
      
      const [matches, pinnedMatches] = await Promise.all([
        enrichMatchesWithUserPredictions(items, user?.userId),
        user?.userId && page === 1
          ? getUserPinnedTodayMatches(user.userId, roundId)
          : [],
      ]);
      prewarmFastMatchLineups([
        ...matches.map((match) => match.id),
        ...pinnedMatches.map((match) => match.id),
      ]);
      return apiSuccess({ matches, pinnedMatches, ...meta }, 200, PRIVATE_SHORT_CACHE);
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
      return apiSuccess(lite, 200, PRIVATE_SHORT_CACHE);
    }

    const matches = await enrichMatchesWithUserPredictions(raw, user?.userId);
    prewarmFastMatchLineups(matches.map((match) => match.id));

    return apiSuccess(matches, 200, PRIVATE_SHORT_CACHE);
  } catch (error) {
    return handleApiError(error);
  }
}
