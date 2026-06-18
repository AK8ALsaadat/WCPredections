import { resolvePlayerInSquad } from "@/lib/player-matching";
import { goalkeeperPositionWhere, isGoalkeeperPosition } from "@/lib/goalkeeper";
import { prisma } from "@/lib/prisma";
import { getPredictionLockReason } from "@/lib/utils";
import { getFootballApiProvider } from "@/services/football-api";
import type {
  ExternalGoalkeeperSave,
  FootballApiProvider,
  SyncOptions,
} from "@/services/football-api/types";
import {
  getUsageRoundScope,
  type UsageRoundScope,
} from "@/services/usage-round.service";

export const OCTOPUS_POINTS = {
  three: 1,
  five: 3,
  seven: 5,
  ten: 8,
} as const;

type MatchForGoalkeeperStats = {
  homeTeam: { id: string; apiTeamId: string | null; name: string };
  awayTeam: { id: string; apiTeamId: string | null; name: string };
};

const matchForGoalkeeperStatsSelect = {
  homeTeam: { select: { id: true, apiTeamId: true, name: true } },
  awayTeam: { select: { id: true, apiTeamId: true, name: true } },
} as const;

function slugifyTeamName(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function calculateOctopusPoints(saves: number | null | undefined) {
  const count = saves ?? 0;
  if (count >= 10) return OCTOPUS_POINTS.ten;
  if (count >= 7) return OCTOPUS_POINTS.seven;
  if (count >= 5) return OCTOPUS_POINTS.five;
  if (count >= 3) return OCTOPUS_POINTS.three;
  return 0;
}

async function resolveTeamId(
  match: MatchForGoalkeeperStats,
  teamApiId: string
) {
  if (
    match.homeTeam.apiTeamId === teamApiId ||
    slugifyTeamName(match.homeTeam.name) === teamApiId
  ) {
    return match.homeTeam.id;
  }
  if (
    match.awayTeam.apiTeamId === teamApiId ||
    slugifyTeamName(match.awayTeam.name) === teamApiId
  ) {
    return match.awayTeam.id;
  }

  const team = await prisma.team.findFirst({
    where: { apiTeamId: teamApiId },
    select: { id: true },
  });
  return team?.id ?? null;
}

export async function replaceGoalkeeperSaves(
  matchId: string,
  apiStats: ExternalGoalkeeperSave[],
  loadedMatch?: MatchForGoalkeeperStats
) {
  const match =
    loadedMatch ??
    (await prisma.match.findUnique({
      where: { id: matchId },
      select: matchForGoalkeeperStatsSelect,
    }));
  if (!match) throw new Error("Match not found");

  const resolved = new Map<string, { playerId: string; saves: number }>();

  for (const { playerApiId, playerName, teamApiId, saves } of apiStats) {
    if (saves < 0) continue;

    let player = await prisma.player.findFirst({
      where: { apiPlayerId: playerApiId },
      select: { id: true, name: true, position: true },
    });

    if (!player && playerName && teamApiId) {
      const teamId = await resolveTeamId(match, teamApiId);
      if (teamId) {
        const squad = await prisma.player.findMany({
          where: { teamId },
          select: { id: true, name: true, apiPlayerId: true, position: true },
        });
        const matched = resolvePlayerInSquad(squad, {
          apiPlayerId: playerApiId,
          playerName,
        });

        player =
          matched ??
          (await prisma.player.upsert({
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
              position: "Goalkeeper",
            },
            update: {
              name: playerName,
              position: "Goalkeeper",
            },
            select: { id: true, name: true, position: true },
          }));
      }
    }

    if (!player || !isGoalkeeperPosition(player.position)) continue;
    resolved.set(player.id, { playerId: player.id, saves });
  }

  await prisma.$transaction(async (tx) => {
    await tx.matchGoalkeeperStat.deleteMany({ where: { matchId } });
    if (resolved.size > 0) {
      await tx.matchGoalkeeperStat.createMany({
        data: Array.from(resolved.values()).map((row) => ({
          matchId,
          playerId: row.playerId,
          saves: row.saves,
          source: "api-football",
        })),
      });
    }
  });

  return resolved.size;
}

export async function syncGoalkeeperSavesFromApi(
  matchId: string,
  fixtureApiId: string,
  options: SyncOptions = {},
  sourceProvider?: FootballApiProvider
) {
  const provider = sourceProvider ?? getFootballApiProvider();
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: matchForGoalkeeperStatsSelect,
  });
  if (!match) throw new Error("Match not found");

  const stats = await provider.fetchGoalkeeperSaves(fixtureApiId, options);
  if (stats.length === 0) return 0;
  return replaceGoalkeeperSaves(matchId, stats, match);
}

export async function calculateOctopusPointsForMatch(matchId: string) {
  const [match, bets, stats] = await Promise.all([
    prisma.match.findUnique({
      where: { id: matchId },
      select: { status: true },
    }),
    prisma.octopusGoalkeeperBet.findMany({
      where: { matchId },
    }),
    prisma.matchGoalkeeperStat.findMany({
      where: { matchId },
      select: { playerId: true, saves: true },
    }),
  ]);

  if (!match || bets.length === 0) return;
  const savesByPlayer = new Map(stats.map((row) => [row.playerId, row.saves]));

  await Promise.all(
    bets.map((bet) =>
      prisma.octopusGoalkeeperBet.update({
        where: { id: bet.id },
        data: {
          points:
            match.status === "FINISHED" || savesByPlayer.has(bet.playerId)
              ? calculateOctopusPoints(savesByPlayer.get(bet.playerId))
              : 0,
        },
      })
    )
  );
}

export async function getOctopusBetForUserRound(
  userId: string,
  usageRoundKey: string
) {
  return prisma.octopusGoalkeeperBet.findUnique({
    where: { userId_usageRoundKey: { userId, usageRoundKey } },
    include: {
      player: { select: { id: true, name: true, teamId: true } },
    },
  });
}

export async function getOctopusBetStatus(
  userId: string,
  matchId: string,
  knownScope?: UsageRoundScope
) {
  const scope = knownScope ?? (await getUsageRoundScope(matchId));
  const existing = await getOctopusBetForUserRound(userId, scope.key);

  return {
    roundId: scope.key,
    used: !!existing,
    onThisMatch: existing?.matchId === matchId,
    onOtherMatch: !!existing && existing.matchId !== matchId,
    bet:
      existing?.matchId === matchId
        ? {
            playerId: existing.playerId,
            playerName: existing.player.name,
            points: existing.points,
          }
        : null,
    otherMatchId: existing && existing.matchId !== matchId ? existing.matchId : null,
  };
}

export async function submitOctopusBet(
  userId: string,
  matchId: string,
  playerId: string | null
) {
  const match = await prisma.match.findUniqueOrThrow({
    where: { id: matchId },
    select: {
      id: true,
      roundId: true,
      homeTeamId: true,
      awayTeamId: true,
      matchTime: true,
      status: true,
    },
  });

  const lockReason = getPredictionLockReason(match.matchTime, match.status);
  if (lockReason) throw new Error(lockReason);

  const scope = await getUsageRoundScope(matchId, match.roundId);
  const existing = await prisma.octopusGoalkeeperBet.findUnique({
    where: { userId_usageRoundKey: { userId, usageRoundKey: scope.key } },
  });

  if (!playerId) {
    if (!existing || existing.matchId !== matchId) return null;
    await prisma.octopusGoalkeeperBet.delete({ where: { id: existing.id } });
    return null;
  }

  if (existing && existing.matchId !== matchId) {
    throw new Error("استخدمت الأخطبوط في مباراة ثانية هالجولة — مرة واحدة بس");
  }

  const [prediction, boldBet, player] = await Promise.all([
    prisma.prediction.findUnique({
      where: { userId_matchId: { userId, matchId } },
      select: { isDouble: true },
    }),
    prisma.boldScorerBet.findUnique({
      where: { userId_usageRoundKey: { userId, usageRoundKey: scope.key } },
      select: { matchId: true },
    }),
    prisma.player.findFirst({
      where: {
        id: playerId,
        teamId: { in: [match.homeTeamId, match.awayTeamId] },
        ...goalkeeperPositionWhere,
      },
      select: { id: true, name: true },
    }),
  ]);

  if (prediction?.isDouble || boldBet?.matchId === matchId) {
    throw new Error("ما تقدر تستخدم الأخطبوط مع المضاعفة أو الرهان على نفس المباراة");
  }

  if (!player) {
    throw new Error("اختيار الحارس غير صالح للأخطبوط");
  }

  return prisma.octopusGoalkeeperBet.upsert({
    where: { userId_usageRoundKey: { userId, usageRoundKey: scope.key } },
    create: {
      userId,
      roundId: match.roundId,
      usageRoundKey: scope.key,
      matchId,
      playerId,
    },
    update: {
      matchId,
      playerId,
      points: 0,
    },
    include: {
      player: { select: { id: true, name: true } },
    },
  });
}
