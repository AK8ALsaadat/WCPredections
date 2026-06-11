import { prisma } from "@/lib/prisma";
import { syncMatchesFromApi } from "@/services/football-api";
import { resolveFootballApiProviderName } from "@/services/football-api/types";
import { recalculateMatchScoring } from "@/services/prediction.service";
import { addDays, format } from "date-fns";

function getHourInTimezone(timeZone: string): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hour12: false,
  }).format(new Date());

  return Number(hour) % 24;
}

export function isSyncQuietHours(): boolean {
  if (process.env.SYNC_QUIET_HOURS === "false") return false;

  const timeZone = process.env.SYNC_TIMEZONE ?? "Asia/Riyadh";
  const start = Number(process.env.SYNC_QUIET_START ?? "10");
  const end = Number(process.env.SYNC_QUIET_END ?? "16");
  const hour = getHourInTimezone(timeZone);

  if (start < end) {
    return hour >= start && hour < end;
  }

  // فترة تعبر منتصف الليل، مثل 22 → 6
  return hour >= start || hour < end;
}

/** كأس العالم — SportScore: fifa-world-cup | API-Football: league=1 | Football-Data: WC */
function getWorldCupSyncOptions() {
  const provider = resolveFootballApiProviderName();

  if (provider === "sportscore") {
    return {
      leagueId:
        (process.env.SPORTSCORE_COMPETITION_SLUG ?? "fifa-world-cup").trim(),
      season: (process.env.FOOTBALL_SEASON ?? "2026").trim(),
      quickSync: true,
    };
  }

  const leagueId =
    process.env.FOOTBALL_LEAGUE_ID ?? (provider === "football-data" ? "WC" : "1");
  const season =
    process.env.FOOTBALL_SEASON ?? (provider === "football-data" ? "2026" : "2022");

  if (provider === "football-data") {
    const base = {
      leagueId: process.env.FOOTBALL_LEAGUE_ID ?? "WC",
      season: process.env.FOOTBALL_SEASON ?? "2026",
    };

    if (process.env.FOOTBALL_SYNC_USE_DATE_RANGE === "true") {
      const today = new Date();
      return {
        ...base,
        dateFrom: format(addDays(today, -7), "yyyy-MM-dd"),
        dateTo: format(addDays(today, 60), "yyyy-MM-dd"),
      };
    }

    return base;
  }

  const base = { leagueId, season };

  if (process.env.FOOTBALL_SYNC_USE_DATE_RANGE === "true") {
    const today = new Date();
    return {
      ...base,
      dateFrom: format(addDays(today, -7), "yyyy-MM-dd"),
      dateTo: format(addDays(today, 60), "yyyy-MM-dd"),
    };
  }

  return base;
}

export async function getOrCreateActiveRound() {
  const wcName = process.env.WORLD_CUP_ROUND_NAME ?? "بطولة الاستراحة - كأس العالم 26";

  const existing = await prisma.round.findFirst({
    where: { name: wcName },
    orderBy: { startsAt: "desc" },
  });

  if (existing) return existing;

  const now = new Date();
  const endsAt = addDays(now, 90);

  return prisma.round.create({
    data: {
      name: wcName,
      startsAt: now,
      endsAt,
    },
  });
}

export async function syncActiveRoundFromApi() {
  if (isSyncQuietHours()) {
    const timeZone = process.env.SYNC_TIMEZONE ?? "Asia/Riyadh";
    const start = process.env.SYNC_QUIET_START ?? "10";
    const end = process.env.SYNC_QUIET_END ?? "16";

    return {
      skipped: true,
      reason: `quiet_hours_${start}_${end}`,
      timeZone,
    };
  }

  const round = await getOrCreateActiveRound();
  const options = getWorldCupSyncOptions();

  const result = await syncMatchesFromApi(round.id, options);

  const scorableMatches = await prisma.match.findMany({
    where: {
      roundId: round.id,
      status: { in: ["LIVE", "FINISHED"] },
      homeScore: { not: null },
      awayScore: { not: null },
    },
    select: { id: true },
  });

  let pointsRecalculated = 0;
  for (const match of scorableMatches) {
    try {
      await recalculateMatchScoring(match.id);
      pointsRecalculated++;
    } catch {
      // تخطي المباريات غير الجاهزة للاحتساب
    }
  }

  return {
    ...result,
    roundId: round.id,
    roundName: round.name,
    pointsRecalculated,
    knockoutAdvancement: result.knockoutAdvancement,
  };
}

let syncInterval: ReturnType<typeof setInterval> | null = null;

export function startAutoSync() {
  if (syncInterval || process.env.ENABLE_AUTO_SYNC === "false") return;

  const minutes = Number(process.env.SYNC_INTERVAL_MINUTES ?? "30");
  const intervalMs = minutes * 60 * 1000;

  const run = async () => {
    try {
      const result = await syncActiveRoundFromApi();
      if ("skipped" in result && result.skipped) {
        console.log("[مزامنة كأس العالم] متوقفة — فترة الهدوء 10 ص إلى 4 م");
        return;
      }
      console.log("[مزامنة كأس العالم]", result);
    } catch (error) {
      console.error("[مزامنة كأس العالم] فشل:", error);
    }
  };

  setTimeout(run, 5000);
  syncInterval = setInterval(run, intervalMs);
  const quietStart = process.env.SYNC_QUIET_START ?? "10";
  const quietEnd = process.env.SYNC_QUIET_END ?? "16";
  const timeZone = process.env.SYNC_TIMEZONE ?? "Asia/Riyadh";
  console.log(
    `[مزامنة كأس العالم] كل ${minutes} دقيقة — بدون تحديث ${quietStart}:00-${quietEnd}:00 (${timeZone})`
  );
}
