import { prisma } from "@/lib/prisma";
import { getFootballApiProvider } from "@/services/football-api";
import type { SyncOptions } from "@/services/football-api/types";

/** استبدال كامل لمسجّلي الأهداف من المصدر — إلغاء VAR يُعكس تلقائياً في التحديث التالي */
export async function syncMatchScorersFromApi(
  matchId: string,
  fixtureApiId: string,
  options: SyncOptions = {}
) {
  const provider = getFootballApiProvider();
  const apiScorers = await provider.fetchMatchScorers(fixtureApiId, options);

  const resolved: { playerId: string; goals: number }[] = [];

  for (const { playerApiId, goals } of apiScorers) {
    if (goals <= 0) continue;

    const player = await prisma.player.findFirst({
      where: { apiPlayerId: playerApiId },
      select: { id: true },
    });

    if (player) {
      resolved.push({ playerId: player.id, goals });
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.matchScorer.deleteMany({ where: { matchId } });

    if (resolved.length > 0) {
      await tx.matchScorer.createMany({
        data: resolved.map((row) => ({
          matchId,
          playerId: row.playerId,
          goals: row.goals,
        })),
      });
    }
  });

  return resolved.length;
}
