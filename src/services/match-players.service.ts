import { cachedFetch } from "@/lib/api-cache";
import { buildExpectedLineup } from "@/lib/expected-lineup";
import { goalkeeperPositionWhere, isGoalkeeperPosition } from "@/lib/goalkeeper";
import {
  isWithinLineupFastRefreshWindow,
  LINEUP_FAST_REFRESH_BEFORE_MS,
} from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import {
  fetchApiFootballSquad,
  fetchProbableLineupFromApiFootball,
  type ExternalLineupPlayer,
} from "@/services/api-football-lineup.service";
import {
  fetchEspnRoster,
  fetchLastEspnLineup,
  type EspnRosterPlayer,
} from "@/services/espn-roster.service";
import { fetchWikidataPlayerPhotos } from "@/services/wikidata-player-photos.service";
import {
  normalizePlayerName,
  playerNamesMatch,
  resolvePlayerInSquad,
} from "@/lib/player-matching";
import { normalizeTeamIdentity } from "@/lib/team-identity";

const EXPECTED_LINEUP_CACHE_MS = 60 * 60 * 1000;
const TEAM_PLAYERS_CACHE_MS = 30 * 60 * 1000;
const TEAM_SQUAD_CACHE_MS = 24 * 60 * 60 * 1000;

const expectedLineupCache = new Map<
  string,
  { data: TeamPlayersView; expiresAt: number }
>();
const teamPlayersCache = new Map<
  string,
  {
    players: {
      id: string;
      name: string;
      position?: string | null;
      shirtNumber?: number | null;
      photoUrl?: string | null;
    }[];
    expiresAt: number;
  }
>();
const teamSquadCache = new Map<
  string,
  { squad: ApiLineupPlayer[]; expiresAt: number }
>();
const apiFootballSquadCache = new Map<
  string,
  { players: Awaited<ReturnType<typeof fetchApiFootballSquad>>; expiresAt: number }
>();

export function clearExpectedLineupCaches() {
  expectedLineupCache.clear();
  teamSquadCache.clear();
  apiFootballSquadCache.clear();
}

type ApiLineupPlayer = {
  id: number;
  name: string;
  position?: string | null;
  shirtNumber?: number | null;
  photoUrl?: string | null;
  grid?: string | null;
};

type ApiTeamPlayers = {
  formation?: string | null;
  lineup?: ApiLineupPlayer[];
  bench?: ApiLineupPlayer[];
};

type PlayerInput = ApiLineupPlayer & {
  section: "lineup" | "bench";
};

export type MatchPlayerView = {
  id: string;
  name: string;
  position?: string | null;
  shirtNumber?: number | null;
  photoUrl?: string | null;
  section: "lineup" | "bench";
  grid?: string | null;
};

/** رسمية | محتملة من آخر مباراة | تقدير من القائمة */
export type LineupSource = "official" | "probable" | "estimated";

export type TeamPlayersView = {
  formation?: string | null;
  players: MatchPlayerView[];
  source: LineupSource;
};

export function mergeProbableBenchWithCurrentRoster<
  T extends { name: string }
>(lineup: T[], bench: T[], currentRoster: T[]): T[] {
  const knownNames = new Set(
    [...lineup, ...bench].map((player) => normalizePlayerName(player.name))
  );
  return [
    ...bench,
    ...currentRoster.filter(
      (player) => !knownNames.has(normalizePlayerName(player.name))
    ),
  ];
}

export function mergeTeamViewWithCurrentRoster(
  view: TeamPlayersView,
  currentRoster: MatchPlayerView[]
): TeamPlayersView {
  const knownIds = new Set(view.players.map((player) => player.id));
  const knownNames = new Set(
    view.players.map((player) => normalizePlayerName(player.name))
  );
  const additions = currentRoster.filter((player) => {
    const normalizedName = normalizePlayerName(player.name);
    if (knownIds.has(player.id) || knownNames.has(normalizedName)) return false;
    knownIds.add(player.id);
    knownNames.add(normalizedName);
    return true;
  });

  if (additions.length === 0) return view;
  return {
    ...view,
    players: [
      ...view.players,
      ...additions.map((player) => ({
        ...player,
        section: "bench" as const,
        grid: null,
      })),
    ],
  };
}

async function appendDatabaseGoalkeepers(
  teamId: string,
  teamName: string,
  shortName: string | null | undefined,
  view: TeamPlayersView
): Promise<TeamPlayersView> {
  const goalkeeperAliasKey = (name: string) => {
    const normalized = normalizePlayerName(name);
    const parts = normalized.split(/\s+/).filter(Boolean);
    const family = parts[parts.length - 1] ?? normalized;
    const initial = parts[0]?.[0] ?? "";
    return `${initial}:${family}`;
  };
  const dedupeGoalkeeperPlayers = (players: MatchPlayerView[]) => {
    const seen = new Set<string>();
    return players.filter((player) => {
      if (!isGoalkeeperPosition(player.position)) return true;
      const key = goalkeeperAliasKey(player.name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const dedupedView = {
    ...view,
    players: dedupeGoalkeeperPlayers(view.players),
  };
  const currentIdentity = normalizeTeamIdentity(teamName);
  const currentShortIdentity = shortName ? normalizeTeamIdentity(shortName) : "";
  const candidateTeams = await prisma.team.findMany({
    select: { id: true, name: true, shortName: true },
  });
  const candidateTeamIds = candidateTeams
    .filter((team) => {
      if (team.id === teamId) return true;
      const nameIdentity = normalizeTeamIdentity(team.name);
      const shortIdentity = normalizeTeamIdentity(team.shortName);
      return (
        nameIdentity === currentIdentity ||
        shortIdentity === currentIdentity ||
        (currentShortIdentity.length > 0 &&
          (nameIdentity === currentShortIdentity ||
            shortIdentity === currentShortIdentity))
      );
    })
    .map((team) => team.id);

  const goalkeepers = await prisma.player.findMany({
    where: {
      teamId: { in: candidateTeamIds.length > 0 ? candidateTeamIds : [teamId] },
      ...goalkeeperPositionWhere,
    },
    select: {
      id: true,
      teamId: true,
      name: true,
      position: true,
      shirtNumber: true,
      apiPlayerId: true,
      photoUrl: true,
    },
    orderBy: [{ shirtNumber: "asc" }, { name: "asc" }],
  });

  if (goalkeepers.length === 0) return dedupedView;

  const normalizedExistingGoalkeepers = new Set(
    goalkeepers
      .filter((player) => player.teamId === teamId)
      .map((player) => normalizePlayerName(player.name))
  );
  const existingGoalkeeperAliases = new Set([
    ...dedupedView.players.map((player) => goalkeeperAliasKey(player.name)),
    ...goalkeepers
      .filter((player) => player.teamId === teamId)
      .map((player) => goalkeeperAliasKey(player.name)),
  ]);
  const aliasGoalkeepersToCopy = goalkeepers.filter(
    (player) =>
      player.teamId !== teamId &&
      !normalizedExistingGoalkeepers.has(normalizePlayerName(player.name)) &&
      !existingGoalkeeperAliases.has(goalkeeperAliasKey(player.name))
  );

  const copiedGoalkeepers =
    aliasGoalkeepersToCopy.length === 0
      ? []
      : await prisma.$transaction(
          aliasGoalkeepersToCopy.map((player) =>
            prisma.player.upsert({
              where: {
                teamId_apiPlayerId: {
                  teamId,
                  apiPlayerId:
                    player.apiPlayerId ??
                    `alias-gk:${normalizePlayerName(player.name).replace(/\s+/g, "-")}`,
                },
              },
              create: {
                teamId,
                apiPlayerId:
                  player.apiPlayerId ??
                  `alias-gk:${normalizePlayerName(player.name).replace(/\s+/g, "-")}`,
                name: player.name,
                position: player.position ?? "Goalkeeper",
                shirtNumber: player.shirtNumber,
                photoUrl: player.photoUrl,
              },
              update: {
                name: player.name,
                position: player.position ?? "Goalkeeper",
                shirtNumber: player.shirtNumber,
                photoUrl: player.photoUrl,
              },
              select: {
                id: true,
                teamId: true,
                name: true,
                position: true,
                shirtNumber: true,
                photoUrl: true,
              },
            })
          )
        );

  const knownIds = new Set(dedupedView.players.map((player) => player.id));
  const knownNames = new Set(
    dedupedView.players.map((player) => normalizePlayerName(player.name))
  );
  const knownAliases = new Set(
    dedupedView.players.map((player) => goalkeeperAliasKey(player.name))
  );
  const additions = [
    ...goalkeepers.filter((player) => player.teamId === teamId),
    ...copiedGoalkeepers,
  ].filter((player) => {
    const normalizedName = normalizePlayerName(player.name);
    const alias = goalkeeperAliasKey(player.name);
    if (
      knownIds.has(player.id) ||
      knownNames.has(normalizedName) ||
      knownAliases.has(alias)
    ) return false;
    knownIds.add(player.id);
    knownNames.add(normalizedName);
    knownAliases.add(alias);
    return true;
  });

  if (additions.length === 0) return dedupedView;

  return {
    ...dedupedView,
    players: [
      ...dedupedView.players,
      ...additions.map((player) => ({
        ...player,
        section: "bench" as const,
        grid: null,
      })),
    ],
  };
}

function compactPlayerName(name: string): string {
  return normalizePlayerName(name).replace(/\s+/g, "");
}

function editDistance(left: string, right: string): number {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    let diagonal = row[0];
    row[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      const previous = row[rightIndex];
      row[rightIndex] = Math.min(
        row[rightIndex] + 1,
        row[rightIndex - 1] + 1,
        diagonal +
          (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
      );
      diagonal = previous;
    }
  }

  return row[right.length];
}

function playerNameSimilarity(left: string, right: string): number {
  const a = compactPlayerName(left);
  const b = compactPlayerName(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.startsWith(b) || b.startsWith(a)) {
    return Math.min(a.length, b.length) / Math.max(a.length, b.length);
  }
  return 1 - editDistance(a, b) / Math.max(a.length, b.length);
}

function lastNameKey(name: string): string {
  const parts = normalizePlayerName(name).split(/\s+/);
  return parts[parts.length - 1] ?? name;
}

function isOfficialPlayerPhoto(photoUrl?: string | null) {
  if (!photoUrl) return false;
  try {
    return new URL(photoUrl).hostname.endsWith("api-sports.io");
  } catch {
    return false;
  }
}

async function within<T>(promise: Promise<T>, ms: number, fallback: T) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise.catch(() => fallback),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function firstAvailable<T>(
  promises: Promise<T | null>[]
): Promise<T | null> {
  return new Promise((resolve) => {
    let pending = promises.length;
    let settled = false;

    if (pending === 0) {
      resolve(null);
      return;
    }

    for (const promise of promises) {
      promise
        .then((value) => {
          if (settled) return;
          if (value != null) {
            settled = true;
            resolve(value);
            return;
          }
          pending--;
          if (pending === 0) resolve(null);
        })
        .catch(() => {
          if (settled) return;
          pending--;
          if (pending === 0) resolve(null);
        });
    }
  });
}

function formationFromGrid(players: { grid?: string | null }[]) {
  const rows = new Map<number, number>();
  for (const player of players) {
    if (!/^\d+:\d+$/.test(player.grid ?? "")) continue;
    const row = Number.parseInt(player.grid!.split(":")[0], 10);
    if (!Number.isInteger(row) || row <= 1) continue;
    rows.set(row, (rows.get(row) ?? 0) + 1);
  }
  const counts = [...rows.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, count]) => count);
  return counts.reduce((sum, count) => sum + count, 0) === 10
    ? counts.join("-")
    : null;
}

function formationFromPositions(
  players: { position?: string | null }[]
): string | null {
  let defenders = 0;
  let midfielders = 0;
  let attackers = 0;

  for (const player of players.slice(0, 11)) {
    const position = (player.position ?? "").toLowerCase();
    if (position.includes("goal")) continue;
    if (
      position.includes("defen") ||
      position.includes("back") ||
      position.includes("sweeper")
    ) {
      defenders++;
    } else if (position.includes("mid")) {
      midfielders++;
    } else if (
      position.includes("attack") ||
      position.includes("forward") ||
      position.includes("striker") ||
      position.includes("wing")
    ) {
      attackers++;
    }
  }

  return defenders + midfielders + attackers === 10
    ? `${defenders}-${midfielders}-${attackers}`
    : null;
}

async function enrichWithApiFootballPhotos(
  teamName: string,
  view: TeamPlayersView
): Promise<TeamPlayersView> {
  if (
    view.players.length > 0 &&
    view.players.every(
      (player) =>
        isOfficialPlayerPhoto(player.photoUrl) &&
        player.shirtNumber != null
    )
  ) {
    return view;
  }

  let squad = apiFootballSquadCache.get(teamName);
  if (!squad || squad.expiresAt <= Date.now()) {
    const players = await within(fetchApiFootballSquad(teamName), 800, []);
    squad = { players, expiresAt: Date.now() + TEAM_SQUAD_CACHE_MS };
    if (players.length > 0) {
      apiFootballSquadCache.set(teamName, squad);
    }
  }
  const matchPlayer = (
    player: MatchPlayerView,
    candidates: typeof squad.players
  ) => {
    const exact = candidates.find(
      (candidate) =>
        normalizePlayerName(candidate.name) === normalizePlayerName(player.name)
    );
    const lastMatches = candidates.filter(
      (candidate) => lastNameKey(candidate.name) === lastNameKey(player.name)
    );
    const similar =
      !exact && lastMatches.length !== 1
        ? candidates
            .map((candidate) => ({
              candidate,
              score: playerNameSimilarity(player.name, candidate.name),
            }))
            .sort((a, b) => b.score - a.score)[0]
        : null;
    return (
      exact ??
      (lastMatches.length === 1 ? lastMatches[0] : null) ??
      (similar && similar.score >= 0.72 ? similar.candidate : null)
    );
  };

  const byName = new Map(
    squad.players.map((player) => [normalizePlayerName(player.name), player])
  );

  const playersToPersist: {
    id: string;
    photoUrl?: string;
    shirtNumber?: number;
  }[] = [];
  const enriched = {
    ...view,
    players: view.players.map((player) => {
      const external =
        byName.get(normalizePlayerName(player.name)) ??
        matchPlayer(player, squad.players);
      if (!external) {
        return player;
      }
      const photoUrl =
        external.photo ??
        `https://media.api-sports.io/football/players/${external.id}.png`;
      const shirtNumber = player.shirtNumber ?? external.number ?? null;
      if (
        !player.id.startsWith("temp-") &&
        ((!isOfficialPlayerPhoto(player.photoUrl) &&
          isOfficialPlayerPhoto(photoUrl)) ||
          (player.shirtNumber == null && shirtNumber != null))
      ) {
        playersToPersist.push({
          id: player.id,
          photoUrl:
            !isOfficialPlayerPhoto(player.photoUrl) &&
            isOfficialPlayerPhoto(photoUrl)
              ? photoUrl
              : undefined,
          shirtNumber:
            player.shirtNumber == null && shirtNumber != null
              ? shirtNumber
              : undefined,
        });
      }
      return {
        ...player,
        shirtNumber,
        photoUrl,
      };
    }),
  };

  if (playersToPersist.length > 0) {
    try {
      await prisma.$transaction(
        playersToPersist.map((player) =>
          prisma.player.updateMany({
            where: { id: player.id },
            data: {
              photoUrl: player.photoUrl,
              shirtNumber: player.shirtNumber,
            },
          })
        )
      );
    } catch {
      // Photos still render from the provider response if persistence is unavailable.
    }
  }

  return enriched;
}

function footballDataCacheKey(
  endpoint: string,
  options?: { unfoldLineups?: boolean }
) {
  return options?.unfoldLineups ? `fd:${endpoint}:unfold` : `fd:${endpoint}`;
}

function lineupFetchTtlMs(matchTime?: Date | null): number {
  if (!matchTime) return 15 * 60 * 1000;
  if (isWithinLineupFastRefreshWindow(matchTime)) {
    return 45 * 1000;
  }
  return 15 * 60 * 1000;
}

function shouldBypassLineupCache(matchTime?: Date | null): boolean {
  if (!matchTime) return false;
  return isWithinLineupFastRefreshWindow(matchTime);
}

async function fetchFootballData<T>(
  endpoint: string,
  options?: {
    unfoldLineups?: boolean;
    ttlMs?: number;
    skipCache?: boolean;
  }
): Promise<T> {
  const key = footballDataCacheKey(endpoint, options);
  if (options?.skipCache) {
    const { invalidateCacheKey } = await import("@/lib/api-cache");
    invalidateCacheKey(key);
  }

  return cachedFetch(
    key,
    async () => {
    const apiKey = process.env.FOOTBALL_DATA_API_KEY;
    const baseUrl =
      process.env.FOOTBALL_DATA_BASE_URL ?? "https://api.football-data.org/v4";

    if (!apiKey) throw new Error("FOOTBALL_DATA_API_KEY is not configured");

    const headers: Record<string, string> = { "X-Auth-Token": apiKey };
    if (options?.unfoldLineups) {
      headers["X-Unfold-Lineups"] = "true";
    }

    const res = await fetch(`${baseUrl}${endpoint}`, {
      headers,
      signal: AbortSignal.timeout(4_000),
      ...(options?.skipCache
        ? { cache: "no-store" as const }
        : {
            next: {
              revalidate: Math.max(
                1,
                Math.floor((options?.ttlMs ?? 15 * 60 * 1000) / 1000)
              ),
            },
          }),
    });

    if (!res.ok) {
      throw new Error(`Football-Data request failed: ${res.statusText}`);
    }

    return res.json() as Promise<T>;
    },
    options?.ttlMs ?? 15 * 60 * 1000
  );
}

async function mapPlayersFromDatabase(
  teamId: string,
  players: PlayerInput[]
): Promise<MatchPlayerView[]> {
  if (players.length === 0) return [];

  const apiPlayerIds = Array.from(
    new Set(players.map((player) => String(player.id)))
  );
  const rows = await prisma.player.findMany({
    where: { teamId, apiPlayerId: { in: apiPlayerIds } },
  });
  const rowsByApiId = new Map(rows.map((row) => [row.apiPlayerId!, row]));

  return players.flatMap((player) => {
    const row = rowsByApiId.get(String(player.id));
    if (!row) return [];
    return [{
      id: row.id,
      name: row.name,
      position: player.position ?? row.position,
      shirtNumber: player.shirtNumber ?? row.shirtNumber,
      photoUrl: player.photoUrl ?? row.photoUrl ?? null,
      section: player.section,
      grid: player.grid ?? null,
    }];
  });
}

async function ensureExternalPlayersInDatabase(
  teamId: string,
  externalPlayers: ExternalLineupPlayer[]
) {
  const squad = await prisma.player.findMany({ where: { teamId } });
  const missing = externalPlayers.filter((external, index) => {
    const duplicateExternal = externalPlayers
      .slice(0, index)
      .some(
        (candidate) =>
          normalizePlayerName(candidate.name) ===
          normalizePlayerName(external.name)
    );
    if (duplicateExternal) return false;
    return !squad.some((player) =>
      playerNamesMatch(player.name, external.name)
    );
  });

  if (missing.length === 0) return squad;

  await prisma.player.createMany({
    data: missing.map((external) => {
      const normalized = normalizePlayerName(external.name).replace(
        /\s+/g,
        "-"
      );
      return {
        teamId,
        apiPlayerId: `lineup:${normalized || external.id}`,
        name: external.name,
        position: external.position ?? null,
        shirtNumber: external.shirtNumber ?? null,
        photoUrl: external.photoUrl ?? null,
      };
    }),
    // skipDuplicates not supported in current Prisma typings here; rely on unique constraints
  });

  return prisma.player.findMany({ where: { teamId } });
}

async function completeTeamViewWithCurrentRoster(
  teamId: string,
  view: TeamPlayersView,
  currentRoster: EspnRosterPlayer[]
): Promise<TeamPlayersView> {
  if (currentRoster.length === 0) return view;

  const externalRoster: ExternalLineupPlayer[] = currentRoster.map(
    (player) => ({
      id: player.id,
      name: player.name,
      position: player.position,
      shirtNumber: player.shirtNumber,
      photoUrl: player.photoUrl,
      grid: null,
    })
  );
  const squad = await ensureExternalPlayersInDatabase(teamId, externalRoster);
  const mappedRoster = externalRoster.flatMap((external) => {
    const resolved = resolvePlayerInSquad(squad, {
      playerName: external.name,
    });
    const row = resolved
      ? squad.find((player) => player.id === resolved.id)
      : null;
    if (!row) return [];
    return [{
      id: row.id,
      name: row.name,
      position: external.position ?? row.position,
      shirtNumber: external.shirtNumber ?? row.shirtNumber,
      photoUrl: external.photoUrl ?? row.photoUrl ?? null,
      section: "bench" as const,
      grid: null,
    }];
  });

  return mergeTeamViewWithCurrentRoster(view, mappedRoster);
}

async function mapProbableLineupByName(
  teamId: string,
  formation: string | null,
  lineup: ExternalLineupPlayer[],
  bench: ExternalLineupPlayer[],
  source: LineupSource = "probable"
): Promise<TeamPlayersView | null> {
  const requestedPhotos = await within(
    fetchWikidataPlayerPhotos(
      [...lineup, ...bench]
        .filter((player) => !player.photoUrl)
        .map((player) => player.name)
    ),
    800,
    new Map<string, string>()
  );
  const withPhoto = (player: ExternalLineupPlayer) => ({
    ...player,
    photoUrl:
      player.photoUrl ??
      requestedPhotos.get(player.name) ??
      null,
  });
  const mappedInputLineup = lineup.map(withPhoto);
  const mappedInputBench = bench.map(withPhoto);
  const externalPlayers = [...mappedInputLineup, ...mappedInputBench];
  const squad = await ensureExternalPlayersInDatabase(teamId, externalPlayers);

  if (squad.length === 0) return null;

  const byFull = new Map(squad.map((p) => [normalizePlayerName(p.name), p]));
  const byLast = new Map<string, typeof squad>();
  for (const player of squad) {
    const key = lastNameKey(player.name);
    const list = byLast.get(key) ?? [];
    list.push(player);
    byLast.set(key, list);
  }

  const usedIds = new Set<string>();
  const resolve = (external: ExternalLineupPlayer): (typeof squad)[0] | null => {
    const full = byFull.get(normalizePlayerName(external.name));
    if (full && !usedIds.has(full.id)) return full;

    const lastMatches = (byLast.get(lastNameKey(external.name)) ?? []).filter(
      (player) => !usedIds.has(player.id)
    );
    if (lastMatches.length === 1) return lastMatches[0];

    const ranked = squad
      .filter((player) => !usedIds.has(player.id))
      .map((player) => ({
        player,
        score: playerNameSimilarity(external.name, player.name),
      }))
      .sort((left, right) => right.score - left.score);
    const best = ranked[0];
    const runnerUp = ranked[1];
    return best &&
      best.score >= 0.62 &&
      best.score - (runnerUp?.score ?? 0) >= 0.05
      ? best.player
      : null;
  };

  const mapSection = (
    players: ExternalLineupPlayer[],
    section: "lineup" | "bench"
  ) => {
    const mapped: MatchPlayerView[] = [];
    for (const external of players) {
      const row = resolve(external);
      if (!row) continue;
      usedIds.add(row.id);
      mapped.push({
        id: row.id,
        name: row.name,
        position: external.position ?? row.position,
        shirtNumber: external.shirtNumber ?? row.shirtNumber,
        photoUrl: external.photoUrl ?? row.photoUrl ?? null,
        section,
        grid: external.grid ?? null,
      });
    }
    return mapped;
  };

  const mappedLineup = mapSection(mappedInputLineup, "lineup");
  const mappedBench = mapSection(mappedInputBench, "bench");
  // If there are fewer than 11 mapped starters, promote bench players
  // from the last match into the lineup until we reach 11 starters.
  if (mappedLineup.length < 11 && mappedBench.length > 0) {
    const need = 11 - mappedLineup.length;
    const toPromote = mappedBench.slice(0, need).map((p) => ({ ...p, section: "lineup" as const }));
    // remove promoted from bench list
    mappedBench.splice(0, toPromote.length);
    mappedLineup.push(...toPromote);
  }
  if (mappedLineup.length < 11) return null;

  return {
    formation:
      formation ??
      formationFromGrid(mappedInputLineup) ??
      formationFromPositions(mappedInputLineup) ??
      "4-3-3",
    players: [...mappedLineup, ...mappedBench],
    source,
  };
}

async function getCachedSquad(
  teamId: string,
  apiTeamId: string
): Promise<ApiLineupPlayer[]> {
  const cacheKey = `squad:${teamId}:${apiTeamId}`;
  const cached = teamSquadCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.squad;
  }

  const cachedPlayers = await prisma.player.findMany({
    where: { teamId, apiPlayerId: { not: null } },
    select: {
      apiPlayerId: true,
      name: true,
      position: true,
      shirtNumber: true,
      photoUrl: true,
    },
  });

  if (cachedPlayers.length >= 20) {
    let squad = cachedPlayers.map((p) => ({
      id: Number(p.apiPlayerId),
      name: p.name,
      position: p.position,
      shirtNumber: p.shirtNumber,
      photoUrl: p.photoUrl,
    }));

    if (squad.some((player) => player.shirtNumber == null)) {
      try {
        const data = await within(
          fetchFootballData<{ squad?: ApiLineupPlayer[] }>(
            `/teams/${apiTeamId}`
          ),
          1_500,
          { squad: [] }
        );
        const officialById = new Map(
          (data.squad ?? []).map((player) => [String(player.id), player])
        );
        squad = squad.map((player) => {
          const official = officialById.get(String(player.id));
          return {
            ...player,
            shirtNumber:
              player.shirtNumber ?? official?.shirtNumber ?? null,
          };
        });

        const withNumbers = squad.filter(
          (player) => player.shirtNumber != null
        );
        if (withNumbers.length > 0) {
          await prisma.$transaction(
            withNumbers.map((player) =>
              prisma.player.updateMany({
                where: {
                  teamId,
                  apiPlayerId: String(player.id),
                  shirtNumber: null,
                },
                data: { shirtNumber: player.shirtNumber },
              })
            )
          );
        }
      } catch {
        // Keep the cached squad; the UI falls back cleanly when a number is absent.
      }
    }

    teamSquadCache.set(cacheKey, {
      squad,
      expiresAt: Date.now() + TEAM_SQUAD_CACHE_MS,
    });
    return squad;
  }

  const data = await fetchFootballData<{ squad?: ApiLineupPlayer[] }>(
    `/teams/${apiTeamId}`
  );
  const squad = data.squad ?? [];
  teamSquadCache.set(cacheKey, {
    squad,
    expiresAt: Date.now() + TEAM_SQUAD_CACHE_MS,
  });
  return squad;
}


function isFootballDataLineupEnabled() {
  return (
    !!process.env.FOOTBALL_DATA_API_KEY &&
    process.env.LINEUP_USE_FOOTBALL_DATA !== "false"
  );
}

async function listFinishedFootballDataMatches(
  apiTeamId: string,
  before: Date
) {
  try {
    const list = await fetchFootballData<{
      matches?: { id: number; status: string; utcDate?: string }[];
    }>(`/teams/${apiTeamId}/matches?limit=30`);

    return (list.matches ?? [])
      .filter((match) => match.status === "FINISHED")
      .filter(
        (match) =>
          new Date(match.utcDate ?? 0).getTime() < before.getTime()
      )
      .sort(
        (left, right) =>
          new Date(right.utcDate ?? 0).getTime() -
          new Date(left.utcDate ?? 0).getTime()
      );
  } catch {
    return [];
  }
}

async function fetchLastFootballDataLineup(
  apiTeamId: string,
  before: Date
): Promise<{
  formation: string | null;
  lineup: ApiLineupPlayer[];
  bench: ApiLineupPlayer[];
} | null> {
  if (!isFootballDataLineupEnabled()) return null;

  try {
    const matches = await listFinishedFootballDataMatches(apiTeamId, before);
    const details = await Promise.all(
      matches.slice(0, 3).map(async (match) => {
        try {
          return await fetchFootballData<{
            homeTeam: ApiTeamPlayers & { id: number };
            awayTeam: ApiTeamPlayers & { id: number };
          }>(`/matches/${match.id}`, { unfoldLineups: true });
        } catch {
          return null;
        }
      })
    );

    for (const detail of details) {
      if (!detail) continue;
      const teamData =
        String(detail.homeTeam.id) === apiTeamId
          ? detail.homeTeam
          : detail.awayTeam;
      if ((teamData.lineup?.length ?? 0) < 11) continue;
      return {
        formation: teamData.formation ?? null,
        lineup: teamData.lineup ?? [],
        bench: teamData.bench ?? [],
      };
    }
  } catch {
    return null;
  }

  return null;
}

/** تشكيلة متوقعة من قائمة المنتخب عبر Football-Data */
async function fetchProbableLineupFromFootballDataSquad(
  teamId: string,
  apiTeamId: string
): Promise<TeamPlayersView | null> {
  if (!isFootballDataLineupEnabled()) return null;

  try {
    const squad = await getCachedSquad(teamId, apiTeamId);
    if (squad.length < 11) return null;

    const expected = buildExpectedLineup(squad);
    return buildTeamView(
      teamId,
      apiTeamId,
      "probable",
      expected.formation,
      expected.lineup,
      expected.bench
    );
  } catch {
    return null;
  }
}

async function buildTeamView(
  teamId: string,
  apiTeamId: string | null,
  source: LineupSource,
  formation: string | null,
  lineup: ApiLineupPlayer[],
  bench: ApiLineupPlayer[]
): Promise<TeamPlayersView> {
  const inputs: PlayerInput[] = [
    ...lineup.map((p) => ({ ...p, section: "lineup" as const })),
    ...bench.map((p) => ({ ...p, section: "bench" as const })),
  ];

  const players = apiTeamId
    ? await mapPlayersFromDatabase(teamId, inputs)
    : inputs.map((p, i) => ({
        id: `temp-${i}`,
        name: p.name,
        position: p.position,
        shirtNumber: p.shirtNumber,
        photoUrl: p.photoUrl ?? null,
        section: p.section,
        grid: p.grid ?? null,
      }));

  return {
    formation:
      formation ??
      formationFromGrid(lineup) ??
      formationFromPositions(lineup) ??
      "4-3-3",
    players,
    source,
  };
}

async function syncOfficialLineup(
  teamId: string,
  apiTeamId: string,
  data: ApiTeamPlayers
): Promise<TeamPlayersView> {
  return buildTeamView(
    teamId,
    apiTeamId,
    "official",
    data.formation ?? null,
    data.lineup ?? [],
    data.bench ?? []
  );
}

async function syncProbableLineup(
  teamId: string,
  apiTeamId: string,
  teamName: string,
  targetMatchId: string,
  targetMatchTime: Date
): Promise<TeamPlayersView | null> {
  const cacheKey = `${teamId}:${apiTeamId}:probable:${targetMatchId}`;
  const cached = expectedLineupCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  type ProbableCandidate = {
    source: "history" | "espn" | "api-football";
    data: {
      formation: string | null;
      lineup: ExternalLineupPlayer[];
      bench: ExternalLineupPlayer[];
    };
  };

  const currentRosterPromise = within(fetchEspnRoster(teamName), 2_000, []);
  const candidate = await firstAvailable<ProbableCandidate>([
    within(
      fetchLastFootballDataLineup(apiTeamId, targetMatchTime),
      2_500,
      null
    ).then((data) => data ? { source: "history" as const, data } : null),
    within(fetchLastEspnLineup(teamName, targetMatchTime), 2_500, null).then(
      (data) => data ? { source: "espn" as const, data } : null
    ),
    within(
      fetchProbableLineupFromApiFootball(teamName, targetMatchTime),
      2_500,
      null
    ).then((data) => data ? { source: "api-football" as const, data } : null),
  ]);
  const currentRoster = await currentRosterPromise;
  const candidateBench = candidate
    ? mergeProbableBenchWithCurrentRoster(
        candidate.data.lineup,
        candidate.data.bench,
        currentRoster
      )
    : [];

  if (candidate) {
    const mapped = await mapProbableLineupByName(
      teamId,
      candidate.data.formation,
      candidate.data.lineup,
      candidateBench
    );
    if (mapped) {
      expectedLineupCache.set(cacheKey, {
        data: mapped,
        expiresAt: Date.now() + EXPECTED_LINEUP_CACHE_MS,
      });
      return mapped;
    }
  }

  // Fallback: build probable lineup from the team's squad (expected starters)
  const fromFootballDataSquad = await fetchProbableLineupFromFootballDataSquad(
    teamId,
    apiTeamId
  );
  if (fromFootballDataSquad) {
    // Ensure any player who appeared in the last actual match is included
    // in the probable lineup (promote from bench into lineup where needed).
    const playedNames = new Set<string>();
    if (candidate?.source === "api-football") {
      for (const p of [...(candidate.data.lineup ?? []), ...(candidate.data.bench ?? [])]) {
        playedNames.add(normalizePlayerName(p.name));
      }
    }

    if (playedNames.size > 0) {
      const adjustedPlayers = fromFootballDataSquad.players.map((p) =>
        playedNames.has(normalizePlayerName(p.name)) ? { ...p, section: "lineup" as const } : p
      );

      const starters = adjustedPlayers.filter((p) => p.section === "lineup");
      let benchPlayers = adjustedPlayers.filter((p) => p.section !== "lineup");

      if (starters.length < 11 && benchPlayers.length > 0) {
        const need = 11 - starters.length;
        const promote = benchPlayers.slice(0, need).map((p) => ({ ...p, section: "lineup" as const }));
        starters.push(...promote);
        benchPlayers = benchPlayers.slice(promote.length);
      }

      const mergedView = {
        ...fromFootballDataSquad,
        players: [...starters, ...benchPlayers],
      };

      expectedLineupCache.set(cacheKey, {
        data: mergedView,
        expiresAt: Date.now() + EXPECTED_LINEUP_CACHE_MS,
      });
      return mergedView;
    }

    expectedLineupCache.set(cacheKey, {
      data: fromFootballDataSquad,
      expiresAt: Date.now() + EXPECTED_LINEUP_CACHE_MS,
    });
    return fromFootballDataSquad;
  }

  return null;
}

async function syncEstimatedLineup(
  teamId: string,
  apiTeamId: string,
  teamName: string
): Promise<TeamPlayersView> {
  const cacheKey = `${teamId}:${apiTeamId}:estimated`;
  const cached = expectedLineupCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const squad = await within(getCachedSquad(teamId, apiTeamId), 3_000, []);
  if (squad.length < 11) {
    const databasePlayers = await prisma.player.findMany({
      where: { teamId },
      orderBy: [{ shirtNumber: "asc" }, { name: "asc" }],
    });
    if (databasePlayers.length < 11) {
      const espnRoster = await within(fetchEspnRoster(teamName), 4_000, []);
      if (espnRoster.length >= 11) {
        const expected = buildExpectedLineup(espnRoster);
        const mapped = await mapProbableLineupByName(
          teamId,
          expected.formation,
          expected.lineup,
          expected.bench,
          "estimated"
        );
        if (mapped) return mapped;
      }
    }

    const expected = buildExpectedLineup(
      databasePlayers.map((player, index) => ({
        id: index,
        name: player.name,
        position: player.position,
        shirtNumber: player.shirtNumber,
      }))
    );
    const starterNames = new Set(expected.lineup.map((player) => player.name));
    return {
      formation: expected.formation,
      source: "estimated",
      players: databasePlayers.map((player) => ({
        id: player.id,
        name: player.name,
        position: player.position,
        shirtNumber: player.shirtNumber,
        photoUrl: player.photoUrl,
        section: starterNames.has(player.name)
          ? ("lineup" as const)
          : ("bench" as const),
        grid: null,
      })),
    };
  }
  const expected = buildExpectedLineup(squad);
  const view = await buildTeamView(
    teamId,
    apiTeamId,
    "estimated",
    expected.formation,
    expected.lineup,
    expected.bench
  );

  expectedLineupCache.set(cacheKey, {
    data: view,
    expiresAt: Date.now() + EXPECTED_LINEUP_CACHE_MS,
  });

  return view;
}

async function syncExpectedLineup(
  teamId: string,
  apiTeamId: string,
  teamName: string,
  targetMatchId: string,
  targetMatchTime: Date
): Promise<TeamPlayersView> {
  const probable = await syncProbableLineup(
    teamId,
    apiTeamId,
    teamName,
    targetMatchId,
    targetMatchTime
  );
  if (probable) return probable;

  return syncEstimatedLineup(teamId, apiTeamId, teamName);
}

async function getRawTeamPlayersForMatch(
  teamId: string,
  apiTeamId: string | null,
  teamName: string,
  apiTeamData?: ApiTeamPlayers,
  targetMatchId = "unknown",
  targetMatchTime = new Date()
): Promise<TeamPlayersView> {
  if (!apiTeamId) {
    const cacheKey = `team:${teamId}:players`;
    const cached = teamPlayersCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        formation: "4-3-3",
        players: cached.players.map((p, i) => ({
          id: p.id,
          name: p.name,
          position: p.position,
          shirtNumber: p.shirtNumber,
          section: i < 11 ? ("lineup" as const) : ("bench" as const),
        })),
        source: "estimated",
      };
    }

    const existing = await prisma.player.findMany({
      where: { teamId },
      orderBy: { name: "asc" },
      take: 16,
    });

    const players = existing.map((p, i) => ({
      id: p.id,
      name: p.name,
      position: p.position,
      shirtNumber: p.shirtNumber,
      photoUrl: p.photoUrl,
      section: i < 11 ? ("lineup" as const) : ("bench" as const),
    }));

    teamPlayersCache.set(cacheKey, {
      players: players.map((p) => ({
        id: p.id,
        name: p.name,
        position: p.position,
        shirtNumber: p.shirtNumber,
        photoUrl: p.photoUrl,
      })),
      expiresAt: Date.now() + TEAM_PLAYERS_CACHE_MS,
    });

    return {
      formation: "4-3-3",
      players,
      source: "estimated",
    };
  }

  if ((apiTeamData?.lineup?.length ?? 0) > 0) {
    return syncOfficialLineup(teamId, apiTeamId, apiTeamData!);
  }

  return syncExpectedLineup(
    teamId,
    apiTeamId,
    teamName,
    targetMatchId,
    targetMatchTime
  );
}

async function getTeamPlayersForMatch(
  teamId: string,
  apiTeamId: string | null,
  teamName: string,
  teamShortName?: string | null,
  apiTeamData?: ApiTeamPlayers,
  targetMatchId = "unknown",
  targetMatchTime = new Date()
): Promise<TeamPlayersView> {
  const [rawView, currentRoster] = await Promise.all([
    getRawTeamPlayersForMatch(
      teamId,
      apiTeamId,
      teamName,
      apiTeamData,
      targetMatchId,
      targetMatchTime
    ),
    within(fetchEspnRoster(teamName), 2_500, []),
  ]);
  const completedView = await completeTeamViewWithCurrentRoster(
    teamId,
    rawView,
    currentRoster
  );
  const withAllGoalkeepers = await appendDatabaseGoalkeepers(
    teamId,
    teamName,
    teamShortName,
    completedView
  );
  return enrichWithApiFootballPhotos(teamName, withAllGoalkeepers);
}

function resolveLineupStatus(
  home: TeamPlayersView,
  away: TeamPlayersView
): LineupSource {
  if (home.source === "official" || away.source === "official") {
    return "official";
  }
  if (home.source === "probable" || away.source === "probable") {
    return "probable";
  }
  return "estimated";
}

async function loadProbableBothTeams(match: {
  id: string;
  matchTime?: Date | null;
  homeTeamId: string;
  awayTeamId: string;
  homeTeam: { apiTeamId: string | null; name: string; shortName?: string | null };
  awayTeam: { apiTeamId: string | null; name: string; shortName?: string | null };
}) {
  const empty: TeamPlayersView = {
    players: [],
    source: "estimated",
    formation: null,
  };
  const targetMatchTime = match.matchTime ?? new Date();

  const [home, away] = await Promise.all([
    getTeamPlayersForMatch(
      match.homeTeamId,
      match.homeTeam.apiTeamId,
      match.homeTeam.name,
      match.homeTeam.shortName,
      undefined,
      match.id,
      targetMatchTime
    ),
    getTeamPlayersForMatch(
      match.awayTeamId,
      match.awayTeam.apiTeamId,
      match.awayTeam.name,
      match.awayTeam.shortName,
      undefined,
      match.id,
      targetMatchTime
    ),
  ]);

  return {
    home: home.players.length > 0 ? home : empty,
    away: away.players.length > 0 ? away : empty,
    lineupStatus: resolveLineupStatus(home, away),
  };
}

export async function getMatchPlayersFromApi(match: {
  id: string;
  apiMatchId: string | null;
  matchTime?: Date | null;
  homeTeamId: string;
  awayTeamId: string;
  homeTeam: { apiTeamId: string | null; name: string; shortName?: string | null };
  awayTeam: { apiTeamId: string | null; name: string; shortName?: string | null };
}) {
  if (process.env.FOOTBALL_API_PROVIDER !== "football-data") {
    return loadProbableBothTeams(match);
  }

  if (!match.apiMatchId) {
    return loadProbableBothTeams(match);
  }

  const msUntilKickoff =
    (match.matchTime?.getTime() ?? Date.now()) - Date.now();
  if (msUntilKickoff > LINEUP_FAST_REFRESH_BEFORE_MS) {
    return loadProbableBothTeams(match);
  }

  try {
    const nearKickoff = shouldBypassLineupCache(match.matchTime ?? null);
    const apiMatch = await fetchFootballData<{
      homeTeam: ApiTeamPlayers & { id: number; name?: string };
      awayTeam: ApiTeamPlayers & { id: number; name?: string };
    }>(`/matches/${match.apiMatchId}`, {
      unfoldLineups: true,
      ttlMs: lineupFetchTtlMs(match.matchTime ?? null),
      skipCache: nearKickoff,
    });

    const [home, away] = await Promise.all([
      getTeamPlayersForMatch(
        match.homeTeamId,
        match.homeTeam.apiTeamId,
        match.homeTeam.name,
        match.homeTeam.shortName,
        apiMatch.homeTeam,
        match.id,
        match.matchTime ?? new Date()
      ),
      getTeamPlayersForMatch(
        match.awayTeamId,
        match.awayTeam.apiTeamId,
        match.awayTeam.name,
        match.awayTeam.shortName,
        apiMatch.awayTeam,
        match.id,
        match.matchTime ?? new Date()
      ),
    ]);

    return {
      home,
      away,
      lineupStatus: resolveLineupStatus(home, away),
    };
  } catch {
    return loadProbableBothTeams(match);
  }
}
