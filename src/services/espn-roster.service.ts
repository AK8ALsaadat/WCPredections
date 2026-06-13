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
  name: string;
  shirtNumber: number;
  photoUrl?: string | null;
};

const ESPN_TEAM_ALIASES: Record<string, string> = {
  turkey: "Türkiye",
  curacao: "Curaçao",
  usa: "United States",
};

const ROSTER_CACHE_MS = 24 * 60 * 60 * 1000;
const rosterCache = new Map<
  string,
  { players: EspnRosterPlayer[]; expiresAt: number }
>();
const rosterInflight = new Map<string, Promise<EspnRosterPlayer[]>>();

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
  const searchName =
    ESPN_TEAM_ALIASES[teamName.trim().toLowerCase()] ?? teamName;
  const url = new URL("https://site.web.api.espn.com/apis/search/v2");
  url.searchParams.set("query", searchName);
  url.searchParams.set("limit", "20");

  const response = await fetch(url, {
    next: { revalidate: 24 * 60 * 60 },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return null;

  const data = (await response.json()) as EspnSearchResponse;
  const candidates = (data.results ?? []).flatMap(
    (result) => result.contents ?? []
  );
  const exactName = searchName.trim().toLowerCase();
  const team = candidates.find(
    (item) =>
      item.sport === "soccer" &&
      item.subtitle === "Men's soccer team" &&
      item.displayName?.trim().toLowerCase() === exactName
  );

  return team?.uid?.match(/~t:(\d+)$/)?.[1] ?? null;
}

async function loadEspnRoster(teamName: string): Promise<EspnRosterPlayer[]> {
  const teamId = await resolveEspnTeamId(teamName);
  if (!teamId) return [];

  const response = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/teams/${teamId}/roster`,
    {
      next: { revalidate: 24 * 60 * 60 },
      signal: AbortSignal.timeout(6_000),
    }
  );
  if (!response.ok) return [];

  const data = (await response.json()) as {
    athletes?: {
      fullName?: string;
      displayName?: string;
      jersey?: string;
      headshot?: { href?: string };
    }[];
  };

  return (data.athletes ?? []).flatMap((athlete) => {
    const name = decodeHtml(athlete.fullName ?? athlete.displayName ?? "");
    const shirtNumber = Number.parseInt(athlete.jersey ?? "", 10);
    if (!name || !Number.isInteger(shirtNumber)) return [];
    return [{
      name,
      shirtNumber,
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
