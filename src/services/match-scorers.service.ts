import { resolvePlayerInSquad } from "@/lib/player-matching";
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

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      homeTeam: { select: { id: true, apiTeamId: true, name: true } },
      awayTeam: { select: { id: true, apiTeamId: true, name: true } },
    },
  });

  const resolved: { playerId: string; goals: number }[] = [];

  for (const { playerApiId, goals, playerName, teamApiId } of apiScorers) {
    if (goals <= 0) continue;

    let player = await prisma.player.findFirst({
      where: { apiPlayerId: playerApiId },
      select: { id: true },
    });

    if (!player && playerName && teamApiId) {
      let teamId: string | null = null;

      if (match?.homeTeam.apiTeamId === teamApiId) {
        teamId = match.homeTeam.id;
      } else if (match?.awayTeam.apiTeamId === teamApiId) {
        teamId = match.awayTeam.id;
      } else {
        const team = await prisma.team.findFirst({
          where: { apiTeamId: teamApiId },
          select: { id: true },
        });
        teamId = team?.id ?? null;
      }

      if (!teamId && match) {
        const slugifyTeamName = (text: string) =>
          text
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");

        const homeSlug = slugifyTeamName(match.homeTeam.name);
        const awaySlug = slugifyTeamName(match.awayTeam.name);

        if (teamApiId === homeSlug) {
          teamId = match.homeTeam.id;
        } else if (teamApiId === awaySlug) {
          teamId = match.awayTeam.id;
        }
      }

      if (teamId) {
        const squad = await prisma.player.findMany({
          where: { teamId },
          select: { id: true, name: true, apiPlayerId: true },
        });

        const matched = resolvePlayerInSquad(squad, {
          apiPlayerId: playerApiId,
          playerName,
        });

        if (matched) {
          player = matched;
        } else {
          const created = await prisma.player.upsert({
            where: {
              teamId_apiPlayerId: {
                teamId,
                apiPlayerId: playerApiId,
              },
            },
            create: {
              teamId,
              name: playerName,
              apiPlayerId: playerApiId,
            },
            update: { name: playerName },
            select: { id: true },
          });
          player = created;
        }
      }
    }

    if (player) {
      resolved.push({ playerId: player.id, goals });
    }
  }

  await prisma.matchScorer.deleteMany({ where: { matchId } });

  if (resolved.length > 0) {
    await prisma.matchScorer.createMany({
      data: resolved.map((row) => ({
        matchId,
        playerId: row.playerId,
        goals: row.goals,
      })),
    });
  }

  return resolved.length;
}
