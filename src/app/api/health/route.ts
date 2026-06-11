import { prisma } from "@/lib/prisma";
import { apiSuccess, apiError } from "@/lib/api";
import { resolveFootballApiProviderName } from "@/services/football-api/types";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;

    const liveMatches = await prisma.match.findMany({
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
    });

    return apiSuccess({
      database: "connected",
      footballApi: resolveFootballApiProviderName(),
      autoSync: process.env.ENABLE_AUTO_SYNC !== "false",
      liveMatches,
    });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Database connection failed",
      503
    );
  }
}
