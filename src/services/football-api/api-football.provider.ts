import type {
  ExternalMatch,
  ExternalPlayer,
  ExternalTeam,
  FootballApiProvider,
  SyncOptions,
} from "./types";

type ApiFootballResponse<T> = {
  response: T;
  errors?: Record<string, string>;
};

function mapStatus(
  status: string
): ExternalMatch["status"] {
  const map: Record<string, ExternalMatch["status"]> = {
    NS: "SCHEDULED",
    TBD: "SCHEDULED",
    "1H": "LIVE",
    HT: "LIVE",
    "2H": "LIVE",
    ET: "LIVE",
    BT: "LIVE",
    P: "LIVE",
    FT: "FINISHED",
    AET: "FINISHED",
    PEN: "FINISHED",
    PST: "POSTPONED",
    CANC: "CANCELLED",
    ABD: "CANCELLED",
  };
  return map[status] ?? "SCHEDULED";
}

function isKnockoutStage(stage?: string): boolean {
  if (!stage) return false;
  return !stage.toLowerCase().includes("group stage");
}

function mapFinishType(status: string): ExternalMatch["finishType"] {
  if (status === "FT") return "NINETY_MINUTES";
  if (status === "AET") return "EXTRA_TIME";
  if (status === "PEN") return "PENALTIES";
  return null;
}

export class ApiFootballProvider implements FootballApiProvider {
  name = "api-football";
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl =
      process.env.API_FOOTBALL_BASE_URL ??
      "https://v3.football.api-sports.io";
    this.apiKey = process.env.API_FOOTBALL_KEY ?? "";
  }

  private async fetch<T>(endpoint: string, params?: Record<string, string>) {
    if (!this.apiKey) {
      throw new Error("API_FOOTBALL_KEY is not configured");
    }

    const url = new URL(`${this.baseUrl}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    const res = await fetch(url.toString(), {
      headers: {
        "x-apisports-key": this.apiKey,
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      throw new Error(`API-Football request failed: ${res.statusText}`);
    }

    const data = (await res.json()) as ApiFootballResponse<T>;
    if (data.errors && Object.keys(data.errors).length > 0) {
      throw new Error(
        `API-Football error: ${JSON.stringify(data.errors)}`
      );
    }

    return data.response;
  }

  async fetchTeams(options: SyncOptions): Promise<ExternalTeam[]> {
    if (!options.leagueId || !options.season) {
      throw new Error("leagueId and season are required for API-Football");
    }

    const response = await this.fetch<
      { team: { id: number; name: string; code: string; logo: string } }[]
    >("/teams", {
      league: options.leagueId,
      season: options.season,
    });

    return response.map((item) => ({
      apiId: String(item.team.id),
      name: item.team.name,
      shortName: item.team.code || item.team.name.slice(0, 3).toUpperCase(),
      logoUrl: item.team.logo,
    }));
  }

  async fetchPlayers(
    teamApiId: string,
    options: SyncOptions
  ): Promise<ExternalPlayer[]> {
    if (!options.season) {
      throw new Error("season is required for API-Football players");
    }

    const response = await this.fetch<
      { players: { id: number; name: string }[] }[]
    >("/players/squads", { team: teamApiId });

    return response.flatMap((item) =>
      (item.players ?? []).map((player) => ({
        apiId: String(player.id),
        name: player.name,
        teamApiId,
      }))
    );
  }

  async fetchMatches(options: SyncOptions): Promise<ExternalMatch[]> {
    const params: Record<string, string> = {};
    if (options.leagueId) params.league = options.leagueId;
    if (options.season) params.season = options.season;
    if (options.dateFrom) params.from = options.dateFrom;
    if (options.dateTo) params.to = options.dateTo;

    const response = await this.fetch<
      {
        fixture: {
          id: number;
          date: string;
          status: { short: string };
        };
        league: { round?: string };
        teams: {
          home: { id: number };
          away: { id: number };
        };
        goals: { home: number | null; away: number | null };
        score: {
          penalty?: { home: number | null; away: number | null };
        };
      }[]
    >("/fixtures", params);

    return response.map((item) => {
      const status = item.fixture.status.short;
      const stageName = item.league.round ?? null;
      const isPenalties = status === "PEN";
      let penaltyWinnerTeamApiId: string | null = null;

      if (isPenalties && item.score.penalty) {
        if (
          item.score.penalty.home !== null &&
          item.score.penalty.away !== null
        ) {
          penaltyWinnerTeamApiId =
            item.score.penalty.home > item.score.penalty.away
              ? String(item.teams.home.id)
              : String(item.teams.away.id);
        }
      }

      return {
        apiId: String(item.fixture.id),
        homeTeamApiId: String(item.teams.home.id),
        awayTeamApiId: String(item.teams.away.id),
        matchTime: new Date(item.fixture.date),
        stageName,
        status: mapStatus(status),
        isKnockout: isKnockoutStage(stageName ?? undefined) || ["AET", "PEN", "ET", "P"].includes(status),
        homeScore: item.goals.home,
        awayScore: item.goals.away,
        finishType: mapFinishType(status),
        penaltyWinnerTeamApiId,
      };
    });
  }
}
