import { cachedFetch } from "@/lib/api-cache";

type ApiFootballPlayer = {
  id: number;
  name: string;
  number?: number | null;
  pos?: string | null;
  grid?: string | null;
};

export type ExternalLineupPlayer = {
  id: number;
  name: string;
  position?: string | null;
  shirtNumber?: number | null;
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
    !!process.env.API_FOOTBALL_KEY &&
    process.env.LINEUP_USE_API_FOOTBALL !== "false"
  );
}

async function apiFetch<T>(
  endpoint: string,
  params: Record<string, string>,
  ttlMs = 60 * 60 * 1000
): Promise<T[]> {
  const baseUrl =
    process.env.API_FOOTBALL_BASE_URL ?? "https://v3.football.api-sports.io";
  const apiKey = process.env.API_FOOTBALL_KEY!;

  const url = new URL(`${baseUrl}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const cacheKey = `af2:${endpoint}?${url.searchParams.toString()}`;
  return cachedFetch(cacheKey, async () => {
    const res = await fetch(url, {
      headers: { "x-apisports-key": apiKey },
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
      throw new Error("API-Football returned errors");
    }

    return data.response ?? [];
  }, ttlMs);
}

function fixtureDayRange(matchTime: Date) {
  const from = new Date(matchTime);
  from.setUTCDate(from.getUTCDate() - 1);
  const to = new Date(matchTime);
  to.setUTCDate(to.getUTCDate() + 1);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function pickFixtureBetweenTeams(
  rows: ApiFootballFixtureRow[],
  homeId: number,
  awayId: number
) {
  return rows.find(
    (row) =>
      (row.teams.home.id === homeId && row.teams.away.id === awayId) ||
      (row.teams.home.id === awayId && row.teams.away.id === homeId)
  );
}

type ApiFootballFixtureTeams = {
  home: { id: number; name: string };
  away: { id: number; name: string };
};

type ApiFootballFixtureRow = {
  fixture: { id: number; date: string; status: { short: string } };
  teams: ApiFootballFixtureTeams;
};

async function findCurrentFixture(
  homeId: number,
  awayId: number,
  matchTime: Date
): Promise<ApiFootballFixtureRow | null> {
  const { from, to } = fixtureDayRange(matchTime);

  const byHomeTeam = await apiFetch<ApiFootballFixtureRow & { teams: ApiFootballFixtureTeams }>(
    "/fixtures",
    { team: String(homeId), from, to },
    45 * 1000
  );
  const direct = pickFixtureBetweenTeams(byHomeTeam, homeId, awayId);
  if (direct) return direct;

  const byAwayTeam = await apiFetch<ApiFootballFixtureRow & { teams: ApiFootballFixtureTeams }>(
    "/fixtures",
    { team: String(awayId), from, to },
    45 * 1000
  );
  const reverse = pickFixtureBetweenTeams(byAwayTeam, homeId, awayId);
  if (reverse) return reverse;

  for (const season of ["2026", "2022"]) {
    const wc = await apiFetch<ApiFootballFixtureRow & { teams: ApiFootballFixtureTeams }>(
      "/fixtures",
      { league: "1", season, from, to },
      45 * 1000
    );
    const hit = pickFixtureBetweenTeams(wc, homeId, awayId);
    if (hit) return hit;
  }

  return null;
}

function lineupFromApiFootballEntry(
  entry: ApiFootballLineupEntry | undefined
): ExternalProbableLineup | null {
  const startXI = entry?.startXI ?? [];
  if (startXI.length < 11) return null;

  return {
    formation: entry?.formation ?? null,
    lineup: mapLineupPlayers(startXI),
    bench: mapLineupPlayers(entry?.substitutes ?? []),
  };
}

/** تشكيلة المباراة الحالية (رسمية) من API-Football */
export async function fetchCurrentMatchLineupsFromApiFootball(
  homeTeamName: string,
  awayTeamName: string,
  matchTime: Date
): Promise<{
  home: ExternalProbableLineup | null;
  away: ExternalProbableLineup | null;
} | null> {
  if (!isEnabled()) return null;

  try {
    const [homeId, awayId] = await Promise.all([
      resolveTeamId(homeTeamName),
      resolveTeamId(awayTeamName),
    ]);
    if (!homeId || !awayId) return null;

    const fixture = await findCurrentFixture(homeId, awayId, matchTime);
    if (!fixture) return null;

    const lineups = await apiFetch<ApiFootballLineupEntry>(
      "/fixtures/lineups",
      { fixture: String(fixture.fixture.id) },
      45 * 1000
    );

    const homeEntry = lineups.find((entry) => entry.team.id === homeId);
    const awayEntry = lineups.find((entry) => entry.team.id === awayId);
    const home = lineupFromApiFootballEntry(homeEntry);
    const away = lineupFromApiFootballEntry(awayEntry);

    if (!home && !away) return null;

    return { home, away };
  } catch {
    return null;
  }
}

function isSeniorNationalTeam(name: string) {
  const lower = name.toLowerCase();
  return (
    !lower.includes(" u") &&
    !lower.endsWith(" w") &&
    !lower.includes(" women")
  );
}

async function resolveTeamId(teamName: string): Promise<number | null> {
  const teams = await apiFetch<{
    team: {
      id: number;
      name: string;
      country?: string | null;
      national?: boolean;
    };
  }>("/teams", { search: teamName });

  const nationals = teams.filter(
    (row) => row.team.national && isSeniorNationalTeam(row.team.name)
  );

  const exact = nationals.find(
    (row) => row.team.name.toLowerCase() === teamName.toLowerCase()
  );
  if (exact) return exact.team.id;

  const partial = nationals.find((row) =>
    row.team.name.toLowerCase().includes(teamName.toLowerCase())
  );
  return partial?.team.id ?? null;
}

function mapLineupPlayers(
  players: { player: ApiFootballPlayer }[]
): ExternalLineupPlayer[] {
  return players.map((row) => ({
    id: row.player.id,
    name: row.player.name,
    shirtNumber: row.player.number ?? null,
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
