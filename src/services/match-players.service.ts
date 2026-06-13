import { cachedFetch } from "@/lib/api-cache";
import { buildExpectedLineup } from "@/lib/expected-lineup";
import { isWithinLineupFastRefreshWindow } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import {
  fetchProbableLineupFromApiFootball,
  type ExternalLineupPlayer,
} from "@/services/api-football-lineup.service";
import { fetchEspnRoster } from "@/services/espn-roster.service";

const EXPECTED_LINEUP_CACHE_MS = 30 * 60 * 1000;
const TEAM_PLAYERS_CACHE_MS = 10 * 60 * 1000;
const TEAM_SQUAD_CACHE_MS = 10 * 60 * 1000;

const expectedLineupCache = new Map<
  string,
  { data: TeamPlayersView; expiresAt: number }
>();
const teamPlayersCache = new Map<
  string,
  {
    players: { id: string; name: string; position?: string | null; shirtNumber?: number | null }[];
    expiresAt: number;
  }
>();
const teamSquadCache = new Map<
  string,
  { squad: ApiLineupPlayer[]; expiresAt: number }
>();

type ApiLineupPlayer = {
  id: number;
  name: string;
  position?: string | null;
  shirtNumber?: number | null;
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

function normalizePlayerName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(?:al|el)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

const PLAYER_NAME_ALIASES = new Map([
  ["roro", "pedromiguel"],
  ["jassemgaberabdulsallam", "jassemgaber"],
  ["edmilson", "edmilsonjunior"],
]);

function lastNameKey(name: string): string {
  const parts = normalizePlayerName(name).split(/\s+/);
  return parts[parts.length - 1] ?? name;
}

async function addMissingShirtNumbers(
  teamId: string,
  teamName: string,
  squad: ApiLineupPlayer[]
): Promise<ApiLineupPlayer[]> {
  if (squad.every((player) => player.shirtNumber != null)) return squad;

  try {
    const roster = await fetchEspnRoster(teamName);
    if (roster.length === 0) return squad;

    const updates: { id: number; shirtNumber: number }[] = [];
    const enriched = squad.map((player) => {
      if (player.shirtNumber != null) return player;
      const playerKey = compactPlayerName(player.name);
      const alias = PLAYER_NAME_ALIASES.get(playerKey);
      const ranked = roster
        .map((candidate) => ({
          candidate,
          score:
            alias === compactPlayerName(candidate.name)
              ? 1
              : playerNameSimilarity(player.name, candidate.name),
        }))
        .sort((a, b) => b.score - a.score);
      const best = ranked[0];
      const runnerUp = ranked[1];
      const shirtNumber =
        best &&
        best.score >= 0.72 &&
        best.score - (runnerUp?.score ?? 0) >= 0.08
          ? best.candidate.shirtNumber
          : null;
      if (shirtNumber == null) return player;
      updates.push({ id: player.id, shirtNumber });
      return { ...player, shirtNumber };
    });

    await Promise.all(
      updates.map((player) =>
        prisma.player.updateMany({
          where: { teamId, apiPlayerId: String(player.id) },
          data: { shirtNumber: player.shirtNumber },
        })
      )
    );

    return enriched;
  } catch {
    return squad;
  }
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
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      throw new Error(`Football-Data request failed: ${res.statusText}`);
    }

    return res.json() as Promise<T>;
    },
    options?.ttlMs ?? 15 * 60 * 1000
  );
}

async function batchUpsertPlayers(
  teamId: string,
  players: PlayerInput[]
): Promise<MatchPlayerView[]> {
  if (players.length === 0) return [];

  const uniquePlayers = new Map<string, PlayerInput>();
  for (const player of players) {
    uniquePlayers.set(String(player.id), player);
  }

  const rows = await prisma.$transaction(
    Array.from(uniquePlayers.values()).map((player) =>
      prisma.player.upsert({
        where: {
          teamId_apiPlayerId: {
            teamId,
            apiPlayerId: String(player.id),
          },
        },
        create: {
          teamId,
          apiPlayerId: String(player.id),
          name: player.name,
          position: player.position ?? null,
          shirtNumber: player.shirtNumber ?? null,
        },
        update: {
          name: player.name,
          position: player.position ?? null,
          ...(player.shirtNumber != null
            ? { shirtNumber: player.shirtNumber }
            : {}),
        },
      })
    )
  );
  const rowsByApiId = new Map(rows.map((row) => [row.apiPlayerId!, row]));

  return players.map((player) => {
    const row = rowsByApiId.get(String(player.id))!;
    return {
      id: row.id,
      name: row.name,
      position: row.position ?? player.position ?? null,
      shirtNumber: row.shirtNumber ?? player.shirtNumber ?? null,
      section: player.section,
      grid: player.grid ?? null,
    };
  });
}

async function mapProbableLineupByName(
  teamId: string,
  formation: string | null,
  lineup: ExternalLineupPlayer[],
  bench: ExternalLineupPlayer[]
): Promise<TeamPlayersView | null> {
  const squad = await prisma.player.findMany({ where: { teamId } });
  if (squad.length === 0) return null;

  const byFull = new Map(squad.map((p) => [normalizePlayerName(p.name), p]));
  const byLast = new Map<string, typeof squad>();
  for (const player of squad) {
    const key = lastNameKey(player.name);
    const list = byLast.get(key) ?? [];
    list.push(player);
    byLast.set(key, list);
  }

  const resolve = (external: ExternalLineupPlayer): (typeof squad)[0] | null => {
    const full = byFull.get(normalizePlayerName(external.name));
    if (full) return full;

    const lastMatches = byLast.get(lastNameKey(external.name));
    if (lastMatches?.length === 1) return lastMatches[0];
    return null;
  };

  const mapSection = (
    players: ExternalLineupPlayer[],
    section: "lineup" | "bench"
  ) => {
    const mapped: MatchPlayerView[] = [];
    for (const external of players) {
      const row = resolve(external);
      if (!row) continue;
      mapped.push({
        id: row.id,
        name: row.name,
        position: external.position ?? row.position,
        shirtNumber: external.shirtNumber ?? row.shirtNumber,
        section,
        grid: external.grid ?? null,
      });
    }
    return mapped;
  };

  const mappedLineup = mapSection(lineup, "lineup");
  if (mappedLineup.length < 11) return null;

  return {
    formation,
    players: [...mappedLineup, ...mapSection(bench, "bench")],
    source: "probable",
  };
}

async function getCachedSquad(
  teamId: string,
  apiTeamId: string,
  teamName: string
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
    },
  });

  if (cachedPlayers.length >= 20) {
    const squad = await addMissingShirtNumbers(teamId, teamName, cachedPlayers.map((p) => ({
      id: Number(p.apiPlayerId),
      name: p.name,
      position: p.position,
      shirtNumber: p.shirtNumber,
    })));
    teamSquadCache.set(cacheKey, {
      squad,
      expiresAt: Date.now() + TEAM_SQUAD_CACHE_MS,
    });
    return squad;
  }

  const data = await fetchFootballData<{ squad?: ApiLineupPlayer[] }>(
    `/teams/${apiTeamId}`
  );
  const squad = await addMissingShirtNumbers(
    teamId,
    teamName,
    data.squad ?? []
  );
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

async function listFinishedFootballDataMatches(apiTeamId: string) {
  try {
    const list = await fetchFootballData<{
      matches?: { id: number; status: string }[];
    }>(`/teams/${apiTeamId}/matches?limit=30`);

    return (list.matches ?? []).filter((match) => match.status === "FINISHED");
  } catch {
    return [];
  }
}

async function fetchLastFootballDataLineup(
  apiTeamId: string
): Promise<{
  formation: string | null;
  lineup: ApiLineupPlayer[];
  bench: ApiLineupPlayer[];
} | null> {
  if (!isFootballDataLineupEnabled()) return null;

  try {
    const matches = await listFinishedFootballDataMatches(apiTeamId);

    for (const match of matches.slice(0, 3)) {
      try {
        const detail = await fetchFootballData<{
          homeTeam: ApiTeamPlayers & { id: number };
          awayTeam: ApiTeamPlayers & { id: number };
        }>(`/matches/${match.id}`, { unfoldLineups: true });

        const teamData =
          String(detail.homeTeam.id) === apiTeamId
            ? detail.homeTeam
            : detail.awayTeam;

        if ((teamData.lineup?.length ?? 0) >= 11) {
          return {
            formation: teamData.formation ?? null,
            lineup: teamData.lineup ?? [],
            bench: teamData.bench ?? [],
          };
        }
      } catch {
        continue;
      }
    }
  } catch {
    return null;
  }

  return null;
}

/** تشكيلة متوقعة من قائمة المنتخب عبر Football-Data */
async function fetchProbableLineupFromFootballDataSquad(
  teamId: string,
  apiTeamId: string,
  teamName: string
): Promise<TeamPlayersView | null> {
  if (!isFootballDataLineupEnabled()) return null;

  try {
    const squad = await getCachedSquad(teamId, apiTeamId, teamName);
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
    ? await batchUpsertPlayers(teamId, inputs)
    : inputs.map((p, i) => ({
        id: `temp-${i}`,
        name: p.name,
        position: p.position,
        shirtNumber: p.shirtNumber,
        section: p.section,
        grid: p.grid ?? null,
      }));

  return { formation, players, source };
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
  teamName: string
): Promise<TeamPlayersView | null> {
  const cacheKey = `${teamId}:${apiTeamId}:probable`;
  const cached = expectedLineupCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const fromHistory = await fetchLastFootballDataLineup(apiTeamId);
  if (fromHistory) {
    const view = await buildTeamView(
      teamId,
      apiTeamId,
      "probable",
      fromHistory.formation,
      fromHistory.lineup,
      fromHistory.bench
    );
    expectedLineupCache.set(cacheKey, {
      data: view,
      expiresAt: Date.now() + EXPECTED_LINEUP_CACHE_MS,
    });
    return view;
  }

  const fromFootballDataSquad = await fetchProbableLineupFromFootballDataSquad(
    teamId,
    apiTeamId,
    teamName
  );
  if (fromFootballDataSquad) {
    expectedLineupCache.set(cacheKey, {
      data: fromFootballDataSquad,
      expiresAt: Date.now() + EXPECTED_LINEUP_CACHE_MS,
    });
    return fromFootballDataSquad;
  }

  const fromApiFootball = await fetchProbableLineupFromApiFootball(teamName);
  if (fromApiFootball) {
    const mapped = await mapProbableLineupByName(
      teamId,
      fromApiFootball.formation,
      fromApiFootball.lineup,
      fromApiFootball.bench
    );
    if (mapped) {
      expectedLineupCache.set(cacheKey, {
        data: mapped,
        expiresAt: Date.now() + EXPECTED_LINEUP_CACHE_MS,
      });
      return mapped;
    }
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

  const squad = await getCachedSquad(teamId, apiTeamId, teamName);
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
  teamName: string
): Promise<TeamPlayersView> {
  const probable = await syncProbableLineup(teamId, apiTeamId, teamName);
  if (probable) return probable;

  return syncEstimatedLineup(teamId, apiTeamId, teamName);
}

async function getTeamPlayersForMatch(
  teamId: string,
  apiTeamId: string | null,
  teamName: string,
  apiTeamData?: ApiTeamPlayers
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
      section: i < 11 ? ("lineup" as const) : ("bench" as const),
    }));

    teamPlayersCache.set(cacheKey, {
      players: players.map((p) => ({
        id: p.id,
        name: p.name,
        position: p.position,
        shirtNumber: p.shirtNumber,
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

  return syncExpectedLineup(teamId, apiTeamId, teamName);
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
  homeTeamId: string;
  awayTeamId: string;
  homeTeam: { apiTeamId: string | null; name: string };
  awayTeam: { apiTeamId: string | null; name: string };
}) {
  const empty: TeamPlayersView = {
    players: [],
    source: "estimated",
    formation: null,
  };

  const [home, away] = await Promise.all([
    match.homeTeam.apiTeamId
      ? syncExpectedLineup(
          match.homeTeamId,
          match.homeTeam.apiTeamId,
          match.homeTeam.name
        )
      : getTeamPlayersForMatch(match.homeTeamId, null, match.homeTeam.name),
    match.awayTeam.apiTeamId
      ? syncExpectedLineup(
          match.awayTeamId,
          match.awayTeam.apiTeamId,
          match.awayTeam.name
        )
      : getTeamPlayersForMatch(match.awayTeamId, null, match.awayTeam.name),
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
  homeTeam: { apiTeamId: string | null; name: string };
  awayTeam: { apiTeamId: string | null; name: string };
}) {
  if (process.env.FOOTBALL_API_PROVIDER !== "football-data") {
    return loadProbableBothTeams(match);
  }

  if (!match.apiMatchId) {
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
        apiMatch.homeTeam
      ),
      getTeamPlayersForMatch(
        match.awayTeamId,
        match.awayTeam.apiTeamId,
        match.awayTeam.name,
        apiMatch.awayTeam
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
