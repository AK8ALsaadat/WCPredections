import { cachedFetch } from "@/lib/api-cache";

let apiUnavailableUntil = 0;

type ApiFootballPlayer = {
  id: number;
  name: string;
  number?: number | null;
  pos?: string | null;
  grid?: string | null;
};

export type ApiFootballSquadPlayer = {
  id: number;
  name: string;
  number?: number | null;
  position?: string | null;
  photo?: string | null;
};

type ApiFootballPlayerSearchRow = {
  player: {
    id: number;
    name: string;
    firstname?: string | null;
    lastname?: string | null;
    photo?: string | null;
  };
  statistics?: {
    games?: {
      number?: number | null;
      position?: string | null;
    };
  }[];
};

export type ExternalLineupPlayer = {
  id: number;
  name: string;
  position?: string | null;
  shirtNumber?: number | null;
  photoUrl?: string | null;
  grid?: string | null;
};

export type ExternalProbableLineup = {
  formation: string | null;
  lineup: ExternalLineupPlayer[];
  bench: ExternalLineupPlayer[];
  fixtureDate?: string;
};

function isEnabled() {
  return (
    Date.now() >= apiUnavailableUntil &&
    !!process.env.API_FOOTBALL_KEY &&
    process.env.LINEUP_USE_API_FOOTBALL !== "false"
  );
}

async function apiFetch<T>(
  endpoint: string,
  params: Record<string, string>
): Promise<T[]> {
  const baseUrl =
    process.env.API_FOOTBALL_BASE_URL ?? "https://v3.football.api-sports.io";
  const apiKey = process.env.API_FOOTBALL_KEY!;

  const url = new URL(`${baseUrl}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const cacheKey = `af3:${endpoint}?${url.searchParams.toString()}`;
  return cachedFetch(cacheKey, async () => {
    const res = await fetch(url, {
      headers: { "x-apisports-key": apiKey },
      signal: AbortSignal.timeout(6_000),
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      throw new Error(`API-Football request failed: ${res.statusText}`);
    }

    const data = (await res.json()) as {
      response?: T[];
      errors?: Record<string, string> | unknown[];
    };

    const hasBlockingErrors =
      data.errors &&
      !Array.isArray(data.errors) &&
      Object.keys(data.errors).length > 0 &&
      (data.response?.length ?? 0) === 0;

    if (hasBlockingErrors) {
      apiUnavailableUntil = Date.now() + 30 * 60 * 1000;
      throw new Error("API-Football returned errors");
    }

    return data.response ?? [];
  }, 60 * 60 * 1000);
}

function isSeniorNationalTeam(name: string) {
  const lower = name.toLowerCase();
  return (
    !lower.includes(" u") &&
    !lower.endsWith(" w") &&
    !lower.includes(" women")
  );
}

const TEAM_NAME_ALIASES: Record<string, string> = {
  "bosnia-herzegovina": "Bosnia & Herzegovina",
};
const teamIdCache = new Map<string, number | null>();

function repairMojibake(value: string) {
  if (!/[ÃÂ]/.test(value)) return value;
  try {
    return Buffer.from(value, "latin1").toString("utf8");
  } catch {
    return value;
  }
}

function apiFootballTeamName(teamName: string) {
  const repaired = repairMojibake(teamName).trim();
  return TEAM_NAME_ALIASES[repaired.toLowerCase()] ?? repaired;
}

async function resolveTeamId(teamName: string): Promise<number | null> {
  type TeamRow = {
    team: {
      id: number;
      name: string;
      country?: string | null;
      national?: boolean;
    };
  };

  const resolvedName = apiFootballTeamName(teamName);
  const cacheKey = resolvedName.toLowerCase();
  if (teamIdCache.has(cacheKey)) return teamIdCache.get(cacheKey) ?? null;

  const exactRows = await apiFetch<TeamRow>("/teams", { name: resolvedName });
  const exactNational = exactRows.find(
    (row) =>
      row.team.national &&
      isSeniorNationalTeam(row.team.name) &&
      row.team.name.toLowerCase() === resolvedName.toLowerCase()
  );
  if (exactNational) {
    teamIdCache.set(cacheKey, exactNational.team.id);
    return exactNational.team.id;
  }

  const teams = await apiFetch<TeamRow>("/teams", { search: resolvedName });

  const nationals = teams.filter(
    (row) => row.team.national && isSeniorNationalTeam(row.team.name)
  );

  const exact = nationals.find(
    (row) => row.team.name.toLowerCase() === resolvedName.toLowerCase()
  );
  if (exact) {
    teamIdCache.set(cacheKey, exact.team.id);
    return exact.team.id;
  }

  const partial = nationals.find((row) =>
    row.team.name.toLowerCase().includes(resolvedName.toLowerCase())
  );
  const teamId = partial?.team.id ?? null;
  teamIdCache.set(cacheKey, teamId);
  return teamId;
}

export async function fetchApiFootballSquad(
  teamName: string
): Promise<ApiFootballSquadPlayer[]> {
  if (!isEnabled()) return [];

  try {
    const teamId = await resolveTeamId(teamName);
    if (!teamId) return [];

    const rows = await apiFetch<{
      players?: ApiFootballSquadPlayer[];
    }>("/players/squads", { team: String(teamId) });

    return rows[0]?.players ?? [];
  } catch {
    return [];
  }
}

export async function fetchApiFootballPlayer(
  teamName: string,
  playerName: string
): Promise<ApiFootballSquadPlayer | null> {
  if (!isEnabled()) return null;

  try {
    const teamId = await resolveTeamId(teamName);
    if (!teamId) return null;

    const repairedName = repairMojibake(playerName);
    const parts = repairedName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/[^a-zA-Z]+/)
      .filter(Boolean);
    const search = parts[parts.length - 1];
    if (!search || search.length < 4) return null;

    const rows = await apiFetch<ApiFootballPlayerSearchRow>("/players", {
      search,
      team: String(teamId),
      season: "2024",
    });
    const row = rows[0];
    if (!row) return null;

    const games = row.statistics?.[0]?.games;
    return {
      id: row.player.id,
      name:
        [row.player.firstname, row.player.lastname].filter(Boolean).join(" ") ||
        row.player.name,
      number: games?.number ?? null,
      position: games?.position ?? null,
      photo: row.player.photo ?? null,
    };
  } catch {
    return null;
  }
}

function mapLineupPlayers(
  players: { player: ApiFootballPlayer }[]
): ExternalLineupPlayer[] {
  return players.map((row) => ({
    id: row.player.id,
    name: row.player.name,
    shirtNumber: row.player.number ?? null,
    photoUrl: `https://media.api-sports.io/football/players/${row.player.id}.png`,
    position: row.player.pos ?? null,
    grid: row.player.grid ?? null,
  }));
}

type ApiFootballLineupEntry = {
  team: { id: number };
  formation?: string | null;
  startXI?: { player: ApiFootballPlayer }[];
  substitutes?: { player: ApiFootballPlayer }[];
};

type ApiFootballFixtureRow = {
  fixture: { id: number; date: string; status: { short: string } };
};

async function listRecentFixtures(teamId: number): Promise<ApiFootballFixtureRow[]> {
  const seasons = ["2024", "2023", "2022"];

  for (const season of seasons) {
    const rows = await apiFetch<ApiFootballFixtureRow>("/fixtures", {
      team: String(teamId),
      season,
    });

    const finished = rows
      .filter((row) => row.fixture.status.short === "FT")
      .sort(
        (a, b) =>
          new Date(b.fixture.date).getTime() - new Date(a.fixture.date).getTime()
      )
      .slice(0, 5);

    if (finished.length > 0) {
      return finished;
    }
  }

  return [];
}

/** آخر تشكيلة حقيقية من مباريات المنتخب */
export async function fetchProbableLineupFromApiFootball(
  teamName: string
): Promise<ExternalProbableLineup | null> {
  if (!isEnabled()) return null;

  try {
    const teamId = await resolveTeamId(teamName);
    if (!teamId) return null;

    const fixtures = await listRecentFixtures(teamId);

    for (const row of fixtures.slice(0, 5)) {
      const lineups = await apiFetch<ApiFootballLineupEntry>(
        "/fixtures/lineups",
        { fixture: String(row.fixture.id) }
      );

      const teamLineup = lineups.find((entry) => entry.team.id === teamId);
      const startXI = teamLineup?.startXI ?? [];

      if (startXI.length < 11) continue;

      return {
        formation: teamLineup?.formation ?? null,
        lineup: mapLineupPlayers(startXI),
        bench: mapLineupPlayers(teamLineup?.substitutes ?? []),
        fixtureDate: row.fixture.date,
      };
    }

    return null;
  } catch {
    return null;
  }
}
