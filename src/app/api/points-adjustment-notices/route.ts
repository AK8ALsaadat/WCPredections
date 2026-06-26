import { apiSuccess, handleApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";

export async function GET() {
  try {
    const user = await requireAuth();

    const corrections = await prisma.octopusGoalkeeperBet.findMany({
      where: {
        userId: user.userId,
        cancelledAt: null,
        points: { gt: 0 },
        match: {
          goalkeeperStats: {
            some: {
              source: { startsWith: "manual-source:" },
            },
          },
        },
      },
      select: {
        id: true,
        points: true,
        playerId: true,
        player: { select: { name: true } },
        match: {
          select: {
            id: true,
            homeScore: true,
            awayScore: true,
            homeTeam: { select: { name: true } },
            awayTeam: { select: { name: true } },
            goalkeeperStats: {
              where: {
                source: { startsWith: "manual-source:" },
              },
              select: {
                playerId: true,
                saves: true,
                source: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const notices = corrections.flatMap((bet) => {
      const stat = bet.match.goalkeeperStats.find(
        (row) => row.playerId === bet.playerId
      );
      if (!stat) return [];

      const score =
        bet.match.homeScore != null && bet.match.awayScore != null
          ? ` ${bet.match.homeScore}-${bet.match.awayScore}`
          : "";
      const matchName = `${bet.match.homeTeam.name} vs ${bet.match.awayTeam.name}${score}`;

      return [
        {
          id: `octopus-correction:${bet.id}:${stat.saves}:${bet.points}`,
          title: "تم تحديث نقاط الأخطبوط",
          message: `تم اعتماد ${stat.saves} تصديات لـ ${bet.player.name} في مباراة ${matchName}. نقاطك الآن +${bet.points}.`,
          matchId: bet.match.id,
          points: bet.points,
          source: stat.source,
        },
      ];
    });

    return apiSuccess(notices, 200, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
