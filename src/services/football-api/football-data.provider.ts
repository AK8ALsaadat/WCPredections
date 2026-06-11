import type {
  ExternalMatch,
  ExternalPlayer,
  ExternalTeam,
  FootballApiProvider,
  SyncOptions,
} from "./types";

function mapStageName(stage: string): string {
  const map: Record<string, string> = {
    GROUP_STAGE: "Group Stage",
    LAST_32: "Round of 32",
    LAST_16: "Round of 16",
    QUARTER_FINALS: "Quarter-finals",
    SEMI_FINALS: "Semi-finals",
    THIRD_PLACE: "3rd Place Final",
    FINAL: "Final",
  };
  return map[stage] ?? stage;
}

function isKnockoutStage(stage: string): boolean {
  return !["GROUP_STAGE", "REGULAR"].includes(stage);
}

function mapStatus(status: string): ExternalMatch["status"] {
  const map: Record<string, ExternalMatch["status"]> = {
    SCHEDULED: "SCHEDULED",
    TIMED: "SCHEDULED",
    IN_PLAY: "LIVE",
    PAUSED: "LIVE",
    FINISHED: "FINISHED",
    POSTPONED: "POSTPONED",
    CANCELLED: "CANCELLED",
    SUSPENDED: "POSTPONED",
  };
  return map[status] ?? "SCHEDULED";
}

export class FootballDataProvider implements FootballApiProvider {
  name = "football-data";
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl =
      process.env.FOOTBALL_DATA_BASE_URL ??
      "https://api.football-data.org/v4";
    this.apiKey = process.env.FOOTBALL_DATA_API_KEY ?? "";
  }

  private async fetch<T>(endpoint: string) {
    if (!this.apiKey) {
      throw new Error("FOOTBALL_DATA_API_KEY is not configured");
    }

    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      headers: { "X-Auth-Token": this.apiKey },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      throw new Error(`Football-Data request failed: ${res.statusText}`);
    }

    return res.json() as Promise<T>;
  }

  async fetchTeams(options: SyncOptions): Promise<ExternalTeam[]> {
    if (!options.leagueId) {
      throw new Error("leagueId is required for Football-Data.org");
    }

    const params = new URLSearchParams();
    if (options.season) params.set("season", options.season);
    const query = params.toString() ? `?${params.toString()}` : "";

    const data = await this.fetch<{
      teams: {
        id: number;
        name: string;
        shortName: string;
        crest: string;
      }[];
    }>(`/competitions/${options.leagueId}/teams${query}`);

    return data.teams.map((team) => ({
      apiId: String(team.id),
      name: team.name,
      shortName: team.shortName || team.name.slice(0, 3).toUpperCase(),
      logoUrl: team.crest,
    }));
  }

  async fetchPlayers(
    teamApiId: string,
    _options: SyncOptions
  ): Promise<ExternalPlayer[]> {
    const data = await this.fetch<{
      squad: { id: number; name: string }[];
    }>(`/teams/${teamApiId}`);

    return (data.squad ?? []).map((player) => ({
      apiId: String(player.id),
      name: player.name,
      teamApiId,
    }));
  }

  async fetchMatches(options: SyncOptions): Promise<ExternalMatch[]> {
    if (!options.leagueId) {
      throw new Error("leagueId is required for Football-Data.org");
    }

    let endpoint = `/competitions/${options.leagueId}/matches`;
    const params = new URLSearchParams();
    if (options.season) params.set("season", options.season);
    if (options.dateFrom) params.set("dateFrom", options.dateFrom);
    if (options.dateTo) params.set("dateTo", options.dateTo);
    if (params.toString()) endpoint += `?${params.toString()}`;

    const data = await this.fetch<{
      matches: {
        id: number;
        utcDate: string;
        status: string;
        homeTeam: { id: number | null; name: string | null; shortName?: string | null };
        awayTeam: { id: number | null; name: string | null; shortName?: string | null };
        score: {
          fullTime: { home: number | null; away: number | null };
        };
        stage: string;
        group: string | null;
      }[];
    }>(endpoint);

    return data.matches.map((match) => {
      const homeName = match.homeTeam.name ?? "يُحدد لاحقاً";
      const awayName = match.awayTeam.name ?? "يُحدد لاحقاً";

      return {
      apiId: String(match.id),
      homeTeamApiId: match.homeTeam.id
        ? String(match.homeTeam.id)
        : `tbd-${match.id}-home`,
      awayTeamApiId: match.awayTeam.id
        ? String(match.awayTeam.id)
        : `tbd-${match.id}-away`,
      homeTeamName: homeName,
      awayTeamName: awayName,
      homeTeamShortName: match.homeTeam.shortName ?? homeName.slice(0, 3),
      awayTeamShortName: match.awayTeam.shortName ?? awayName.slice(0, 3),
      matchTime: new Date(match.utcDate),
      groupCode: match.group,
      stageName: mapStageName(match.stage),
      status: mapStatus(match.status),
      isKnockout: isKnockoutStage(match.stage),
      homeScore: match.score.fullTime.home,
      awayScore: match.score.fullTime.away,
      finishType:
        match.status === "FINISHED" ? "NINETY_MINUTES" : null,
    };
    });
  }
}
