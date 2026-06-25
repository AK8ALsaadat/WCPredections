import { resolvePlayerInSquad } from "@/lib/player-matching";
import { goalkeeperPositionWhere, isGoalkeeperPosition } from "@/lib/goalkeeper";
import {
  calculateOctopusPoints,
  getOctopusConcededCapPoints,
  OCTOPUS_POINTS,
} from "@/lib/octopus-points";
import { prisma } from "@/lib/prisma";
import { getPredictionLockReason } from "@/lib/utils";
import { revalidateTag } from "next/cache";
import { ApiFootballProvider } from "@/services/football-api/api-football.provider";
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

export { calculateOctopusPoints, getOctopusConcededCapPoints, OCTOPUS_POINTS };

type MatchForGoalkeeperStats = {
  matchTime?: Date | null;
  roundId?: string;
  homeTeam: { id: string; apiTeamId: string | null; name: string };
  awayTeam: { id: string; apiTeamId: string | null; name: string };
};

const matchForGoalkeeperStatsSelect = {
  matchTime: true,
  roundId: true,
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

async function resolveTeamId(
  match: MatchForGoalkeeperStats,
  teamApiId: string,
  teamName?: string
) {
  const normalizedTeamName = teamName ? slugifyTeamName(teamName) : null;
  if (
    match.homeTeam.apiTeamId === teamApiId ||
    slugifyTeamName(match.homeTeam.name) === teamApiId ||
    (normalizedTeamName != null &&
      slugifyTeamName(match.homeTeam.name) === normalizedTeamName)
  ) {
    return match.homeTeam.id;
  }
  if (
    match.awayTeam.apiTeamId === teamApiId ||
    slugifyTeamName(match.awayTeam.name) === teamApiId ||
    (normalizedTeamName != null &&
      slugifyTeamName(match.awayTeam.name) === normalizedTeamName)
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

  for (const { playerApiId, playerName, teamApiId, teamName, saves } of apiStats) {
    if (saves < 0) continue;

    let player = await prisma.player.findFirst({
      where: { apiPlayerId: playerApiId },
      select: { id: true, name: true, position: true },
    });

    if (!player && playerName && teamApiId) {
      const teamId = await resolveTeamId(match, teamApiId, teamName);
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

  // بعد إدخال/تحديث إحصائيات تصديات الحراس، أعد حساب نقاط الأخطبوط للمباراة
  try {
    await calculateOctopusPointsForMatch(matchId);
  } catch (err) {
    // لا نفشل العملية بسبب خطأ إعادة الحساب
    // eslint-disable-next-line no-console
    console.warn("[octopus] calculateOctopusPointsForMatch failed:", err instanceof Error ? err.message : err);
  }

  // حاول إعادة تهيئة كاش الليدربورد وصفحة المباراة
  try {
    revalidateTag("leaderboard-overall");
    revalidateTag(`match-${matchId}`);
    if (match?.roundId) revalidateTag(`leaderboard-round-${match.roundId}`);
  } catch (err) {
    // Ignore revalidation failures in background contexts
    // eslint-disable-next-line no-console
    console.warn("[revalidate] skipped due to missing store:", err instanceof Error ? err.message : err);
  }

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

  const providerOptions = {
    ...options,
    fixtureDate: match.matchTime?.toISOString().slice(0, 10),
    homeTeamName: match.homeTeam.name,
    awayTeamName: match.awayTeam.name,
  };
  let stats = await provider.fetchGoalkeeperSaves(fixtureApiId, providerOptions);
  if (
    stats.length === 0 &&
    provider.name !== "api-football" &&
    process.env.API_FOOTBALL_KEY
  ) {
    stats = await new ApiFootballProvider().fetchGoalkeeperSaves(
      fixtureApiId,
      providerOptions
    );
  }
  if (stats.length === 0) return 0;
  return replaceGoalkeeperSaves(matchId, stats, match);
}

export async function calculateOctopusPointsForMatch(matchId: string) {
  const [match, bets, stats] = await Promise.all([
    prisma.match.findUnique({
      where: { id: matchId },
      select: {
        apiMatchId: true,
        status: true,
        homeTeamId: true,
        awayTeamId: true,
        homeScore: true,
        awayScore: true,
      },
    }),
    prisma.octopusGoalkeeperBet.findMany({
      where: { matchId, cancelledAt: null },
      include: { player: { select: { teamId: true } } },
    }),
    prisma.matchGoalkeeperStat.findMany({
      where: { matchId },
      select: { playerId: true, saves: true },
    }),
  ]);

  if (!match || bets.length === 0) return;
  let goalkeeperStats = stats;
  const apiMatchId = match.apiMatchId;
  const missingSavedStats =
    match.status === "FINISHED" &&
    apiMatchId != null &&
    bets.some((bet) => !goalkeeperStats.some((row) => row.playerId === bet.playerId));

  if (missingSavedStats) {
    try {
      await syncGoalkeeperSavesFromApi(matchId, apiMatchId);
      goalkeeperStats = await prisma.matchGoalkeeperStat.findMany({
        where: { matchId },
        select: { playerId: true, saves: true },
      });
    } catch (err) {
      console.warn(
        "[octopus] goalkeeper saves refresh failed:",
        err instanceof Error ? err.message : err
      );
    }
  }

  const savesByPlayer = new Map(
    goalkeeperStats.map((row) => [row.playerId, row.saves])
  );
  const goalsConcededByTeam = new Map<string, number | null>([
    [match.homeTeamId, match.awayScore],
    [match.awayTeamId, match.homeScore],
  ]);

  await Promise.all(
    bets.map((bet) =>
      prisma.octopusGoalkeeperBet.update({
        where: { id: bet.id },
        data: {
          points:
            match.status === "FINISHED" || savesByPlayer.has(bet.playerId)
              ? calculateOctopusPoints(
                  savesByPlayer.get(bet.playerId),
                  goalsConcededByTeam.get(bet.player.teamId)
                )
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
  const isCancelled = !!existing?.cancelledAt;
  const activeOnThisMatch = existing?.matchId === matchId && !isCancelled;

  return {
    roundId: scope.key,
    used: !!existing,
    onThisMatch: activeOnThisMatch,
    onOtherMatch: !!existing && existing.matchId !== matchId && !isCancelled,
    bet:
      activeOnThisMatch
        ? {
            playerId: existing.playerId,
            playerName: existing.player.name,
            points: existing.points,
          }
        : null,
    otherMatchId:
      existing && existing.matchId !== matchId && !isCancelled
        ? existing.matchId
        : null,
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

    // For the active round we do NOT delete the row so the user can't reuse
    // the octopus in the same usage key. Instead, keep the record and reset
    // points to 0. For non-active rounds allow deletion as before.
    const now = new Date();
    const isActiveRound = await prisma.round.findFirst({
      where: { id: match.roundId, startsAt: { lte: now }, endsAt: { gte: now } },
      select: { id: true },
    });
    if (isActiveRound) {
      await prisma.octopusGoalkeeperBet.update({
        where: { id: existing.id },
        data: { points: 0, cancelledAt: new Date() },
      });
      return null;
    }

    await prisma.octopusGoalkeeperBet.delete({ where: { id: existing.id } });
    return null;
  }

  if (existing?.cancelledAt) {
    throw new Error("Octopus already used this round");
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
      select: { matchId: true, cancelledAt: true },
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

  if (prediction?.isDouble || (boldBet?.matchId === matchId && !boldBet.cancelledAt)) {
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
      cancelledAt: null,
    },
    include: {
      player: { select: { id: true, name: true } },
    },
  });
}
