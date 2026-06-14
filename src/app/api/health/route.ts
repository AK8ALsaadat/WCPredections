import { prisma } from "@/lib/prisma";
import { apiSuccess, apiError } from "@/lib/api";
import { resolveFootballApiProviderName } from "@/services/football-api/types";

export async function GET() {
  try {
    const [, liveMatches] = await Promise.all([
      prisma.$queryRaw`SELECT 1`,
      prisma.match.findMany({
        where: { status: "LIVE" },
        select: {
          id: true,
          homeScore: true,
          awayScore: true,
          apiMatchId: true,
          homeTeam: { select: { shortName: true } },
          awayTeam: { select: { shortName: true } },
        },
        take: 5,
      }),
    ]);

    return apiSuccess(
      {
        database: "connected",
        footballApi: resolveFootballApiProviderName(),
        autoSync: process.env.ENABLE_AUTO_SYNC !== "false",
        liveMatches,
      },
      200,
      {
        headers: {
          "Cache-Control":
            "public, max-age=5, s-maxage=15, stale-while-revalidate=30",
        },
      }
    );
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Database connection failed",
      503
    );
  }
}
