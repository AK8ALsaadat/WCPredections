import { normalizeTeamIdentity } from "@/lib/team-identity";

type EspnSearchContent = {
  uid?: string;
  displayName?: string;
  subtitle?: string;
  sport?: string;
};

type EspnSearchResponse = {
  results?: {
    contents?: EspnSearchContent[];
  }[];
};

export type EspnRosterPlayer = {
  id: number;
  name: string;
  position?: string | null;
  shirtNumber?: number | null;
  photoUrl?: string | null;
};

export type EspnLineupPlayer = {
  id: number;
  name: string;
  position?: string | null;
  shirtNumber?: number | null;
  photoUrl?: string | null;
  grid?: string | null;
};

export type EspnPreviousLineup = {
  formation: string | null;
  lineup: EspnLineupPlayer[];
  bench: EspnLineupPlayer[];
  fixtureDate: string;
};

const ESPN_TEAM_ALIASES: Record<string, string> = {
  turkey: "Türkiye",
  curacao: "Curaçao",
  "cape verde islands": "Cape Verde",
  usa: "United States",
};

const ESPN_TEAM_SEARCH_NAMES: Record<string, string> = {
  turkey: "Turkiye",
  curacao: "Curacao",
  "cape verde": "Cape Verde",
  "congo dr": "Congo DR",
  "united states": "United States",
  "south korea": "South Korea",
  "ivory coast": "Ivory Coast",
};

const ROSTER_CACHE_MS = 24 * 60 * 60 * 1000;
const rosterCache = new Map<
  string,
  { players: EspnRosterPlayer[]; expiresAt: number }
>();
const rosterInflight = new Map<string, Promise<EspnRosterPlayer[]>>();

async function fetchEspnJson<T>(
  url: string | URL,
  revalidate: number,
  timeoutMs: number
): Promise<T | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, {
        next: { revalidate },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.ok) return (await response.json()) as T;
    } catch {
      // Retry once because ESPN search intermittently returns gateway timeouts.
    }
    if (attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  return null;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10))
    )
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();
}

async function resolveEspnTeamId(teamName: string): Promise<string | null> {
  const teamIdentity = normalizeTeamIdentity(teamName);
  const searchName =
    ESPN_TEAM_SEARCH_NAMES[teamIdentity] ??
    ESPN_TEAM_ALIASES[teamName.trim().toLowerCase()] ??
    teamName;
  const url = new URL("https://site.web.api.espn.com/apis/search/v2");
  url.searchParams.set("query", searchName);
  url.searchParams.set("limit", "20");

  const data = await fetchEspnJson<EspnSearchResponse>(
    url,
    24 * 60 * 60,
    10_000
  );
  if (!data) return null;
  const candidates = (data.results ?? []).flatMap(
    (result) => result.contents ?? []
  );
  const team = candidates.find(
    (item) =>
      item.sport === "soccer" &&
      /~t:\d+$/.test(item.uid ?? "") &&
      !item.subtitle?.toLowerCase().includes("women") &&
      normalizeTeamIdentity(item.displayName ?? "") === teamIdentity
  );

  return team?.uid?.match(/~t:(\d+)$/)?.[1] ?? null;
}

async function loadEspnRoster(teamName: string): Promise<EspnRosterPlayer[]> {
  const teamId = await resolveEspnTeamId(teamName);
  if (!teamId) return [];

  const data = await fetchEspnJson<{
    athletes?: {
      id?: string;
      fullName?: string;
      displayName?: string;
      jersey?: string;
      headshot?: { href?: string };
      position?: { name?: string };
    }[];
  }>(
    `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/teams/${teamId}/roster`,
    24 * 60 * 60,
    6_000
  );
  if (!data) return [];

  return (data.athletes ?? []).flatMap((athlete) => {
    const name = decodeHtml(athlete.fullName ?? athlete.displayName ?? "");
    const id = Number.parseInt(athlete.id ?? "", 10);
    const shirtNumber = Number.parseInt(athlete.jersey ?? "", 10);
    if (!name || !Number.isInteger(id)) {
      return [];
    }
    return [{
      id,
      name,
      position: athlete.position?.name ?? null,
      shirtNumber: Number.isInteger(shirtNumber) ? shirtNumber : null,
      photoUrl: athlete.headshot?.href ?? null,
    }];
  });
}

export async function fetchEspnRoster(
  teamName: string
): Promise<EspnRosterPlayer[]> {
  const cacheKey = teamName.trim().toLowerCase();
  const cached = rosterCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.players;

  const inflight = rosterInflight.get(cacheKey);
  if (inflight) return inflight;

  const request = loadEspnRoster(teamName)
    .then((players) => {
      if (players.length > 0) {
        rosterCache.set(cacheKey, {
          players,
          expiresAt: Date.now() + ROSTER_CACHE_MS,
        });
      }
      return players;
    })
    .finally(() => {
      rosterInflight.delete(cacheKey);
    });

  rosterInflight.set(cacheKey, request);
  return request;
}

export async function fetchLastEspnLineup(
  teamName: string,
  before: Date
): Promise<EspnPreviousLineup | null> {
  const teamId = await resolveEspnTeamId(teamName);
  if (!teamId) return null;

  try {
    const scheduleResponse = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/soccer/all/teams/${teamId}/schedule`,
      {
        next: { revalidate: 60 * 60 },
        signal: AbortSignal.timeout(6_000),
      }
    );
    if (!scheduleResponse.ok) return null;

    const schedule = (await scheduleResponse.json()) as {
      events?: {
        id: string;
        date: string;
        league?: { slug?: string };
        competitions?: {
          boxscoreAvailable?: boolean;
          competitors?: { id?: string }[];
        }[];
      }[];
    };

    const candidates = (schedule.events ?? [])
      .filter((event) => {
        const eventTime = new Date(event.date).getTime();
        const hasTeam = event.competitions?.some((competition) =>
          competition.competitors?.some(
            (competitor) => competitor.id === teamId
          )
        );
        return (
          Number.isFinite(eventTime) &&
          eventTime < before.getTime() &&
          hasTeam &&
          event.competitions?.some(
            (competition) => competition.boxscoreAvailable
          )
        );
      })
      .sort(
        (left, right) =>
          new Date(right.date).getTime() - new Date(left.date).getTime()
      )
      .slice(0, 3);

    for (const event of candidates) {
      const league = event.league?.slug;
      if (!league) continue;
      try {
        const summaryResponse = await fetch(
          `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/summary?event=${event.id}`,
          {
            next: { revalidate: 24 * 60 * 60 },
            signal: AbortSignal.timeout(6_000),
          }
        );
        if (!summaryResponse.ok) continue;

        const summary = (await summaryResponse.json()) as {
          rosters?: {
            team?: { id?: string; displayName?: string };
            roster?: {
              starter?: boolean;
              jersey?: string;
              formationPlace?: string;
              athlete?: {
                id?: string;
                fullName?: string;
                displayName?: string;
                headshot?: { href?: string };
              };
              position?: { name?: string };
            }[];
          }[];
        };
        const teamRoster = summary.rosters?.find(
          (roster) => roster.team?.id === teamId
        );
        if (!teamRoster) continue;

        const mapPlayer = (
          row: NonNullable<typeof teamRoster.roster>[number]
        ): EspnLineupPlayer | null => {
          const name = (
            row.athlete?.fullName ??
            row.athlete?.displayName ??
            ""
          )
            .replace(/\s+null$/i, "")
            .trim();
          const id = Number.parseInt(row.athlete?.id ?? "", 10);
          if (!name || !Number.isInteger(id)) return null;
          const shirtNumber = Number.parseInt(row.jersey ?? "", 10);
          return {
            id,
            name,
            position: row.position?.name ?? null,
            shirtNumber: Number.isInteger(shirtNumber) ? shirtNumber : null,
            photoUrl: row.athlete?.headshot?.href ?? null,
            grid: row.formationPlace ?? null,
          };
        };

        const lineup = (teamRoster.roster ?? [])
          .filter((row) => row.starter)
          .map(mapPlayer)
          .filter((player): player is EspnLineupPlayer => player != null);
        if (lineup.length < 11) continue;
        const bench = (teamRoster.roster ?? [])
          .filter((row) => !row.starter)
          .map(mapPlayer)
          .filter((player): player is EspnLineupPlayer => player != null);

        return {
          formation: null,
          lineup,
          bench,
          fixtureDate: event.date,
        };
      } catch {
        continue;
      }
    }
  } catch {
    return null;
  }

  return null;
}
