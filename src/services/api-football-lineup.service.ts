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
  params: Record<string, string>
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
