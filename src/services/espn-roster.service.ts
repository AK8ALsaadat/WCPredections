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
};

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
  const url = new URL("https://site.web.api.espn.com/apis/search/v2");
  url.searchParams.set("query", teamName);
  url.searchParams.set("limit", "20");

  const response = await fetch(url, { next: { revalidate: 24 * 60 * 60 } });
  if (!response.ok) return null;

  const data = (await response.json()) as EspnSearchResponse;
  const candidates = (data.results ?? []).flatMap(
    (result) => result.contents ?? []
  );
  const exactName = teamName.trim().toLowerCase();
  const team = candidates.find(
    (item) =>
      item.sport === "soccer" &&
      item.subtitle === "Men's soccer team" &&
      item.displayName?.trim().toLowerCase() === exactName
  );

  return team?.uid?.match(/~t:(\d+)$/)?.[1] ?? null;
}

export async function fetchEspnRoster(
  teamName: string
): Promise<EspnRosterPlayer[]> {
  const teamId = await resolveEspnTeamId(teamName);
  if (!teamId) return [];

  const response = await fetch(
    `https://www.espn.com/soccer/team/squad/_/id/${teamId}`,
    { next: { revalidate: 24 * 60 * 60 } }
  );
  if (!response.ok) return [];

  const html = await response.text();
  const playerPattern =
    /data-resource-id="AthleteName"[^>]*>([^<]+)<\/a><span class="pl2 roster-jersey">(\d+)<\/span>/g;
  const players = new Map<string, EspnRosterPlayer>();

  for (const match of html.matchAll(playerPattern)) {
    const name = decodeHtml(match[1]);
    const shirtNumber = Number.parseInt(match[2], 10);
    if (!name || !Number.isInteger(shirtNumber)) continue;
    players.set(name, { name, shirtNumber });
  }

  return Array.from(players.values());
}
