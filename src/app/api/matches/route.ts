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
import { matchIdentityKey } from "@/lib/team-identity";

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

    function dedupeRawMatches(rawMatches: any[]) {
      if (!Array.isArray(rawMatches)) return rawMatches ?? [];
      const groups = new Map<string, any[]>();
      for (const m of rawMatches) {
        const key = `${matchIdentityKey(m.homeTeam?.name, m.awayTeam?.name)}|${new Date(
          m.matchTime
        ).getTime()}`;
        const arr = groups.get(key) ?? [];
        arr.push(m);
        groups.set(key, arr);
      }

      const out: any[] = [];
      for (const [, arr] of groups) {
        if (arr.length === 1) {
          out.push(arr[0]);
          continue;
        }

        // Prefer candidates that include a lineup (if present), otherwise fallback.
        const withLineup = arr.filter(
          (x) => (x.lineup && x.lineup.length > 0) || (x.homeTeam?.lineup && x.homeTeam.lineup.length > 0) || (x.awayTeam?.lineup && x.awayTeam.lineup.length > 0)
        );
        const candidates = withLineup.length > 0 ? withLineup : arr;

        // Heuristic: prefer the candidate with longer team short names (more complete data)
        candidates.sort((a, b) => {
          const scoreA = (a.homeTeam?.shortName?.length ?? 0) + (a.awayTeam?.shortName?.length ?? 0);
          const scoreB = (b.homeTeam?.shortName?.length ?? 0) + (b.awayTeam?.shortName?.length ?? 0);
          return scoreB - scoreA;
        });
        out.push(candidates[0]);
      }

      return out;
    }

    const dedupedRaw = dedupeRawMatches(raw);

    if ((schedule || upcoming || completed) && paginated) {
      const { items, meta } = paginateSchedule(dedupedRaw, page, pageSize);
      
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
      const lite = dedupedRaw.map((m: any) => ({
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

    const matches = await enrichMatchesWithUserPredictions(dedupedRaw, user?.userId);
    prewarmFastMatchLineups(matches.map((match) => match.id));

    return apiSuccess(matches, 200, PRIVATE_SHORT_CACHE);
  } catch (error) {
    return handleApiError(error);
  }
}
