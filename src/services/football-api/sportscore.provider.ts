import type {
  ExternalMatch,
  ExternalMatchScorer,
  ExternalPlayer,
  ExternalTeam,
  FootballApiProvider,
  SyncOptions,
} from "./types";

const GROUP_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

type SportScoreMatchSummary = {
  home: string;
  away: string;
  home_logo?: string;
  away_logo?: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
  status_text?: string;
  time: string;
  competition: string;
  url: string;
};

type SportScoreIncident = {
  type: string;
  side?: "home" | "away";
  player?: string;
  is_goal?: boolean;
};

type SportScoreLineupPlayer = {
  name: string;
  number?: number;
  position?: string;
};

type SportScoreStandingsRow = {
  team: string;
  team_slug: string;
  team_logo?: string;
};

type SportScoreStandingsTable = {
  group: string;
  rows: SportScoreStandingsRow[];
};

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function matchSlugFromUrl(url: string): string {
  const trimmed = url.replace(/\/$/, "");
  const parts = trimmed.split("/");
  return parts[parts.length - 1] ?? trimmed;
}

function playerApiId(teamSlug: string, playerName: string): string {
  return `${teamSlug}::${slugify(playerName)}`;
}

function groupCodeFromName(group: string): string | null {
  const numbered = group.match(/Group\s+(\d+)/i);
  if (numbered) {
    const index = Number(numbered[1]) - 1;
    return GROUP_LETTERS[index] ?? null;
  }

  const lettered = group.match(/Group\s+([A-L])/i);
  return lettered ? lettered[1].toUpperCase() : null;
}

function mapStatus(status: string): ExternalMatch["status"] {
  const normalized = status.trim().toLowerCase();
  if (normalized === "live") return "LIVE";
  if (normalized === "finished") return "FINISHED";
  if (normalized === "postponed" || normalized === "delayed") return "POSTPONED";
  if (normalized === "cancelled") return "CANCELLED";
  return "SCHEDULED";
}

function isPlaceholderTeam(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return (
    normalized === "tbd" ||
    normalized.startsWith("winner ") ||
    normalized.startsWith("loser ") ||
    normalized.includes("3rd group")
  );
}

export class SportScoreProvider implements FootballApiProvider {
  name = "sportscore";
  private baseUrl: string;
  private competitionSlug: string;
  private src: string;

  constructor() {
    this.baseUrl =
      process.env.SPORTSCORE_BASE_URL ?? "https://sportscore.com";
    this.competitionSlug =
      process.env.SPORTSCORE_COMPETITION_SLUG ?? "fifa-world-cup";
    this.src =
      process.env.SPORTSCORE_SRC ??
      process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, "") ??
      "wc-predections";
  }

  private async fetch<T>(path: string, params: Record<string, string> = {}) {
    const url = new URL(`${this.baseUrl}${path}`);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
    url.searchParams.set("src", this.src);

    const res = await fetch(url.toString(), { next: { revalidate: 0 } });
    if (!res.ok) {
      throw new Error(`SportScore request failed: ${res.status} ${path}`);
    }

    return res.json() as Promise<T>;
  }

  private async fetchStandingsTables(): Promise<SportScoreStandingsTable[]> {
    const data = await this.fetch<{ tables: SportScoreStandingsTable[] }>(
      "/api/widget/standings/",
      {
        sport: "football",
        slug: this.competitionSlug,
      }
    );

    return data.tables ?? [];
  }

  private buildTeamMaps(tables: SportScoreStandingsTable[]) {
    const teamSlugByName = new Map<string, string>();
    const groupByTeamName = new Map<string, string>();

    for (const table of tables) {
      const groupCode = groupCodeFromName(table.group);
      if (!groupCode) continue;

      for (const row of table.rows) {
        teamSlugByName.set(row.team, row.team_slug);
        groupByTeamName.set(row.team, groupCode);
      }
    }

    return { teamSlugByName, groupByTeamName };
  }

  async fetchTeams(_options: SyncOptions): Promise<ExternalTeam[]> {
    const tables = await this.fetchStandingsTables();
    const teams = new Map<string, ExternalTeam>();

    for (const table of tables) {
      if (table.group.toLowerCase().includes("third placed")) continue;

      for (const row of table.rows) {
        teams.set(row.team_slug, {
          apiId: row.team_slug,
          name: row.team,
          shortName: row.team.slice(0, 3).toUpperCase(),
          logoUrl: row.team_logo,
        });
      }
    }

    return Array.from(teams.values());
  }

  async fetchPlayers(
    teamApiId: string,
    _options: SyncOptions
  ): Promise<ExternalPlayer[]> {
    const schedule = await this.fetch<{
      matches: SportScoreMatchSummary[];
    }>("/api/widget/team/", {
      sport: "football",
      slug: teamApiId,
      limit: "30",
    });

    const wcMatch = (schedule.matches ?? []).find(
      (match) => match.competition === "FIFA World Cup"
    );

    if (!wcMatch) return [];

    const slug = matchSlugFromUrl(wcMatch.url);
    const detail = await this.fetch<{
      match: {
        home: string;
        away: string;
        lineups?: {
          home_xi?: SportScoreLineupPlayer[];
          home_subs?: SportScoreLineupPlayer[];
          away_xi?: SportScoreLineupPlayer[];
          away_subs?: SportScoreLineupPlayer[];
        };
      };
    }>("/api/widget/match/", {
      sport: "football",
      slug,
    });

    const lineups = detail.match?.lineups;
    if (!lineups) return [];

    const tables = await this.fetchStandingsTables();
    const { teamSlugByName } = this.buildTeamMaps(tables);
    const homeSlug =
      teamSlugByName.get(detail.match.home) ?? slugify(detail.match.home);
    const awaySlug =
      teamSlugByName.get(detail.match.away) ?? slugify(detail.match.away);
    const isHome = teamApiId === homeSlug;
    const isAway = teamApiId === awaySlug;

    const players = isHome
      ? [...(lineups.home_xi ?? []), ...(lineups.home_subs ?? [])]
      : isAway
        ? [...(lineups.away_xi ?? []), ...(lineups.away_subs ?? [])]
        : [];

    const unique = new Map<string, ExternalPlayer>();
    for (const player of players) {
      if (!player.name?.trim()) continue;
      const apiId = playerApiId(teamApiId, player.name);
      unique.set(apiId, {
        apiId,
        name: player.name,
        teamApiId,
      });
    }

    return Array.from(unique.values());
  }

  async fetchMatches(_options: SyncOptions): Promise<ExternalMatch[]> {
    const tables = await this.fetchStandingsTables();
    const { teamSlugByName, groupByTeamName } = this.buildTeamMaps(tables);
    const teamSlugs = Array.from(new Set(teamSlugByName.values()));
    const matches = new Map<string, ExternalMatch>();

    for (const teamSlug of teamSlugs) {
      const schedule = await this.fetch<{
        matches: SportScoreMatchSummary[];
      }>("/api/widget/team/", {
        sport: "football",
        slug: teamSlug,
        limit: "30",
      });

      for (const item of schedule.matches ?? []) {
        if (item.competition !== "FIFA World Cup") continue;

        const slug = matchSlugFromUrl(item.url);
        if (matches.has(slug)) continue;

        const homeSlug =
          teamSlugByName.get(item.home) ?? slugify(item.home);
        const awaySlug =
          teamSlugByName.get(item.away) ?? slugify(item.away);

        const homeGroup = groupByTeamName.get(item.home);
        const awayGroup = groupByTeamName.get(item.away);
        const sameGroup =
          !!homeGroup && !!awayGroup && homeGroup === awayGroup;
        const isKnockout =
          isPlaceholderTeam(item.home) ||
          isPlaceholderTeam(item.away) ||
          (!!homeGroup && !!awayGroup && homeGroup !== awayGroup);

        matches.set(slug, {
          apiId: slug,
          homeTeamApiId: homeSlug,
          awayTeamApiId: awaySlug,
          homeTeamName: item.home,
          awayTeamName: item.away,
          homeTeamShortName: item.home.slice(0, 3),
          awayTeamShortName: item.away.slice(0, 3),
          matchTime: new Date(item.time),
          groupCode: sameGroup ? homeGroup : null,
          stageName: isKnockout ? "Knockout Stage" : "Group Stage",
          status: mapStatus(item.status),
          isKnockout,
          homeScore: item.home_score,
          awayScore: item.away_score,
          finishType:
            mapStatus(item.status) === "FINISHED" ? "NINETY_MINUTES" : null,
        });
      }
    }

    return Array.from(matches.values()).sort(
      (a, b) => a.matchTime.getTime() - b.matchTime.getTime()
    );
  }

  async fetchMatchScorers(
    fixtureApiId: string,
    _options: SyncOptions
  ): Promise<ExternalMatchScorer[]> {
    const detail = await this.fetch<{
      match: {
        home: string;
        away: string;
        incidents?: SportScoreIncident[];
      };
    }>("/api/widget/match/", {
      sport: "football",
      slug: fixtureApiId,
    });

    const match = detail.match;
    if (!match?.incidents?.length) return [];

    const tables = await this.fetchStandingsTables();
    const { teamSlugByName } = this.buildTeamMaps(tables);

    const homeSlug = teamSlugByName.get(match.home) ?? slugify(match.home);
    const awaySlug = teamSlugByName.get(match.away) ?? slugify(match.away);
    const goals = new Map<string, ExternalMatchScorer>();

    for (const incident of match.incidents) {
      if (incident.type !== "Goal" || incident.is_goal === false) continue;
      if (!incident.player?.trim() || !incident.side) continue;

      const teamSlug = incident.side === "home" ? homeSlug : awaySlug;
      const apiId = playerApiId(teamSlug, incident.player);
      const existing = goals.get(apiId);

      goals.set(apiId, {
        playerApiId: apiId,
        goals: (existing?.goals ?? 0) + 1,
        playerName: incident.player,
        teamApiId: teamSlug,
      });
    }

    return Array.from(goals.values());
  }
}
