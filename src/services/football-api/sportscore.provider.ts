import type {
  ExternalMatch,
  ExternalMatchScorer,
  ExternalGoalkeeperSave,
  ExternalPlayer,
  ExternalTeam,
  FootballApiProvider,
  SyncOptions,
} from "./types";
import { isCancelledGoalDetail } from "@/lib/fixture-events";
import { isGoalkeeperPosition } from "@/lib/goalkeeper";

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
  detail?: string;
  text?: string;
};

type SportScoreLineupPlayer = {
  name: string;
  number?: number;
  position?: string;
};

type SportScoreStatValue = string | number | null | undefined;

type SportScoreStatRow = {
  name?: string;
  label?: string;
  title?: string;
  type?: string;
  key?: string;
  home?: SportScoreStatValue;
  away?: SportScoreStatValue;
  home_value?: SportScoreStatValue;
  away_value?: SportScoreStatValue;
  homeValue?: SportScoreStatValue;
  awayValue?: SportScoreStatValue;
  values?: Array<{
    side?: "home" | "away";
    team?: "home" | "away";
    value?: SportScoreStatValue;
  }>;
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

function statLabel(stat: SportScoreStatRow) {
  return [
    stat.name,
    stat.label,
    stat.title,
    stat.type,
    stat.key,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
}

function isSavesStat(stat: SportScoreStatRow) {
  const label = statLabel(stat);
  return (
    /\bsaves?\b/.test(label) ||
    /\bgoalkeeper saves?\b/.test(label) ||
    label.includes("تصدي") ||
    label.includes("تصديات")
  );
}

function numberFromStatValue(value: SportScoreStatValue) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const number = Number.parseInt(value.replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function readSideStat(stat: SportScoreStatRow, side: "home" | "away") {
  const direct =
    side === "home"
      ? stat.home ?? stat.home_value ?? stat.homeValue
      : stat.away ?? stat.away_value ?? stat.awayValue;
  const directValue = numberFromStatValue(direct);
  if (directValue != null) return directValue;

  const values = stat.values ?? [];
  const sideValue = values.find(
    (row) => row.side === side || row.team === side
  )?.value;
  return numberFromStatValue(sideValue);
}

function pickGoalkeeper(players: SportScoreLineupPlayer[] | undefined) {
  if (!players?.length) return null;
  return (
    players.find((player) => isGoalkeeperPosition(player.position)) ??
    players.find((player) => /\bgk\b|goal|keeper|حارس/i.test(player.position ?? "")) ??
    null
  );
}

export function parseSportScoreGoalkeeperSavesFromDetail(detail: {
  match?: {
    home?: string;
    away?: string;
    stats?: SportScoreStatRow[];
    statistics?: SportScoreStatRow[];
    lineups?: {
      home_xi?: SportScoreLineupPlayer[];
      away_xi?: SportScoreLineupPlayer[];
    };
  };
}, homeSlug: string, awaySlug: string): ExternalGoalkeeperSave[] {
  const match = detail.match;
  const stats = match?.stats ?? match?.statistics ?? [];
  const saveStat = stats.find(isSavesStat);
  if (!match || !saveStat) return [];

  const homeSaves = readSideStat(saveStat, "home");
  const awaySaves = readSideStat(saveStat, "away");
  const homeGoalkeeper = pickGoalkeeper(match.lineups?.home_xi);
  const awayGoalkeeper = pickGoalkeeper(match.lineups?.away_xi);
  const saves: ExternalGoalkeeperSave[] = [];

  if (homeGoalkeeper?.name && homeSaves != null) {
    saves.push({
      playerApiId: playerApiId(homeSlug, homeGoalkeeper.name),
      playerName: homeGoalkeeper.name,
      teamApiId: homeSlug,
      teamName: match.home,
      saves: homeSaves,
    });
  }

  if (awayGoalkeeper?.name && awaySaves != null) {
    saves.push({
      playerApiId: playerApiId(awaySlug, awayGoalkeeper.name),
      playerName: awayGoalkeeper.name,
      teamApiId: awaySlug,
      teamName: match.away,
      saves: awaySaves,
    });
  }

  return saves;
}

function mapStatus(status: string): ExternalMatch["status"] {
  const normalized = status.trim().toLowerCase();
  if (normalized === "live") return "LIVE";
  if (normalized === "finished") return "FINISHED";
  if (normalized === "postponed" || normalized === "delayed") return "POSTPONED";
  if (normalized === "cancelled") return "CANCELLED";
  return "SCHEDULED";
}

function mapFinishType(item: SportScoreMatchSummary, isKnockout: boolean): ExternalMatch["finishType"] {
  if (mapStatus(item.status) !== "FINISHED") return null;

  const statusText = `${item.status} ${item.status_text ?? ""}`.toLowerCase();
  if (/\bpen|penalt|shootout|ركلات|ترجيح/.test(statusText)) {
    return "PENALTIES";
  }
  if (/\baet\b|extra\s*time|after\s*extra|اشواط|إضاف/.test(statusText)) {
    return "EXTRA_TIME";
  }
  if (
    isKnockout &&
    item.home_score != null &&
    item.away_score != null &&
    item.home_score === item.away_score
  ) {
    return "PENALTIES";
  }

  return "NINETY_MINUTES";
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
            logoUrl:
              row.team_logo ?? `https://countryflagsapi.com/png/${encodeURIComponent(row.team)}`,
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
        position: player.position ?? null,
        shirtNumber: player.number ?? null,
      });
    }

    return Array.from(unique.values());
  }

  private mapMatchSummary(
    item: SportScoreMatchSummary,
    teamSlugByName: Map<string, string>,
    groupByTeamName: Map<string, string>
  ): ExternalMatch {
    const slug = matchSlugFromUrl(item.url);
    const homeSlug = teamSlugByName.get(item.home) ?? slugify(item.home);
    const awaySlug = teamSlugByName.get(item.away) ?? slugify(item.away);
    const homeGroup = groupByTeamName.get(item.home);
    const awayGroup = groupByTeamName.get(item.away);
    const sameGroup = !!homeGroup && !!awayGroup && homeGroup === awayGroup;
    const isKnockout =
      isPlaceholderTeam(item.home) ||
      isPlaceholderTeam(item.away) ||
      (!!homeGroup && !!awayGroup && homeGroup !== awayGroup);

    return {
      apiId: slug,
      homeTeamApiId: homeSlug,
      awayTeamApiId: awaySlug,
      homeTeamName: item.home,
      awayTeamName: item.away,
      homeTeamShortName: item.home.slice(0, 3),
      awayTeamShortName: item.away.slice(0, 3),
      homeTeamLogoUrl: item.home_logo,
      awayTeamLogoUrl: item.away_logo,
      matchTime: new Date(item.time),
      groupCode: sameGroup ? homeGroup : null,
      stageName: isKnockout ? "Knockout Stage" : "Group Stage",
      status: mapStatus(item.status),
      isKnockout,
      homeScore: item.home_score,
      awayScore: item.away_score,
      finishType: mapFinishType(item, isKnockout),
    };
  }

  async fetchMatchesQuick(): Promise<ExternalMatch[]> {
    const [widget, tables] = await Promise.all([
      this.fetch<{ matches: SportScoreMatchSummary[] }>(
        "/api/widget/matches/",
        { sport: "football", limit: "50" }
      ),
      this.fetchStandingsTables(),
    ]);

    const { teamSlugByName, groupByTeamName } = this.buildTeamMaps(tables);

    return (widget.matches ?? [])
      .filter((item) => item.competition === "FIFA World Cup")
      .map((item) =>
        this.mapMatchSummary(item, teamSlugByName, groupByTeamName)
      )
      .sort((a, b) => a.matchTime.getTime() - b.matchTime.getTime());
  }

  private async fetchMatchesFull(): Promise<ExternalMatch[]> {
    const tables = await this.fetchStandingsTables();
    const { teamSlugByName, groupByTeamName } = this.buildTeamMaps(tables);
    const teamSlugs = Array.from(new Set(teamSlugByName.values()));
    const matches = new Map<string, ExternalMatch>();
    const batchSize = 10;

    for (let i = 0; i < teamSlugs.length; i += batchSize) {
      const batch = teamSlugs.slice(i, i + batchSize);
      const schedules = await Promise.all(
        batch.map((teamSlug) =>
          this.fetch<{ matches: SportScoreMatchSummary[] }>(
            "/api/widget/team/",
            {
              sport: "football",
              slug: teamSlug,
              limit: "30",
            }
          )
        )
      );

      for (const schedule of schedules) {
        for (const item of schedule.matches ?? []) {
          if (item.competition !== "FIFA World Cup") continue;

          const slug = matchSlugFromUrl(item.url);
          if (matches.has(slug)) continue;

          matches.set(
            slug,
            this.mapMatchSummary(item, teamSlugByName, groupByTeamName)
          );
        }
      }
    }

    return Array.from(matches.values()).sort(
      (a, b) => a.matchTime.getTime() - b.matchTime.getTime()
    );
  }

  async buildSlugFromTeams(
    homeName: string,
    awayName: string
  ): Promise<string> {
    const { teamSlugByName } = await this.getStandingsMaps();
    const homeSlug = teamSlugByName.get(homeName) ?? slugify(homeName);
    const awaySlug = teamSlugByName.get(awayName) ?? slugify(awayName);
    return `${homeSlug}-vs-${awaySlug}`;
  }

  private cachedStandings: {
    teamSlugByName: Map<string, string>;
    groupByTeamName: Map<string, string>;
  } | null = null;

  private async getStandingsMaps() {
    if (this.cachedStandings) return this.cachedStandings;

    const tables = await this.fetchStandingsTables();
    const maps = this.buildTeamMaps(tables);
    this.cachedStandings = maps;
    return maps;
  }

  async fetchMatchBySlug(slug: string): Promise<ExternalMatch | null> {
    const { teamSlugByName, groupByTeamName } = await this.getStandingsMaps();

    const detail = await this.fetch<{
      match: SportScoreMatchSummary & { url?: string };
    }>("/api/widget/match/", {
      sport: "football",
      slug,
    });

    const raw = detail.match;
    if (!raw || raw.competition !== "FIFA World Cup") return null;

    return this.mapMatchSummary(
      {
        home: raw.home,
        away: raw.away,
        home_logo: raw.home_logo,
        away_logo: raw.away_logo,
        home_score: raw.home_score,
        away_score: raw.away_score,
        status: raw.status,
        status_text: raw.status_text,
        time: raw.time,
        competition: raw.competition,
        url: raw.url ?? `/football/match/${slug}/`,
      },
      teamSlugByName,
      groupByTeamName
    );
  }

  private async buildMatchSlugCandidates(
    fixtureApiId: string,
    options: SyncOptions
  ) {
    const candidates: string[] = [];

    if (options.homeTeamName && options.awayTeamName) {
      const { teamSlugByName } = await this.getStandingsMaps();
      const homeSlug =
        teamSlugByName.get(options.homeTeamName) ??
        slugify(options.homeTeamName);
      const awaySlug =
        teamSlugByName.get(options.awayTeamName) ??
        slugify(options.awayTeamName);
      candidates.push(`${homeSlug}-vs-${awaySlug}`);
      candidates.push(`${awaySlug}-vs-${homeSlug}`);
    }

    candidates.push(fixtureApiId);
    return [...new Set(candidates.filter(Boolean))];
  }

  private async fetchMatchWidget<T>(
    fixtureApiId: string,
    options: SyncOptions
  ) {
    let lastError: unknown = null;

    for (const slug of await this.buildMatchSlugCandidates(
      fixtureApiId,
      options
    )) {
      try {
        return await this.fetch<T>("/api/widget/match/", {
          sport: "football",
          slug,
        });
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError ?? new Error(`SportScore match not found: ${fixtureApiId}`);
  }

  async fetchMatches(options: SyncOptions): Promise<ExternalMatch[]> {
    if (options.quickSync) {
      return this.fetchMatchesQuick();
    }

    return this.fetchMatchesFull();
  }

  async fetchMatchScorers(
    fixtureApiId: string,
    options: SyncOptions
  ): Promise<ExternalMatchScorer[]> {
    const detail = await this.fetchMatchWidget<{
      match: {
        home: string;
        away: string;
        incidents?: SportScoreIncident[];
      };
    }>(fixtureApiId, options);

    const match = detail.match;
    if (!match?.incidents?.length) return [];

    const tables = await this.fetchStandingsTables();
    const { teamSlugByName } = this.buildTeamMaps(tables);

    const homeSlug = teamSlugByName.get(match.home) ?? slugify(match.home);
    const awaySlug = teamSlugByName.get(match.away) ?? slugify(match.away);
    const goals = new Map<string, ExternalMatchScorer>();

    for (const incident of match.incidents) {
      const type = incident.type.trim().toLowerCase();
      const detail = `${incident.detail ?? ""} ${incident.text ?? ""}`;
      if (type !== "goal" || incident.is_goal === false) continue;
      if (isCancelledGoalDetail(detail)) continue;
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

  async fetchGoalkeeperSaves(
    fixtureApiId: string,
    options: SyncOptions
  ): Promise<ExternalGoalkeeperSave[]> {
    const detail = await this.fetchMatchWidget<{
      match: {
        home: string;
        away: string;
        stats?: SportScoreStatRow[];
        statistics?: SportScoreStatRow[];
        lineups?: {
          home_xi?: SportScoreLineupPlayer[];
          away_xi?: SportScoreLineupPlayer[];
        };
      };
    }>(fixtureApiId, options);

    const { teamSlugByName } = await this.getStandingsMaps();
    const match = detail.match;
    if (!match) return [];

    const homeSlug = teamSlugByName.get(match.home) ?? slugify(match.home);
    const awaySlug = teamSlugByName.get(match.away) ?? slugify(match.away);
    return parseSportScoreGoalkeeperSavesFromDetail(
      detail,
      homeSlug,
      awaySlug
    );
  }
}
