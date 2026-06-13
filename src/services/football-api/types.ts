export type ExternalTeam = {
  apiId: string;
  name: string;
  shortName: string;
  logoUrl?: string;
};

export type ExternalPlayer = {
  apiId: string;
  name: string;
  teamApiId: string;
  position?: string | null;
  shirtNumber?: number | null;
};

export type ExternalMatch = {
  apiId: string;
  homeTeamApiId: string;
  awayTeamApiId: string;
  homeTeamName?: string;
  awayTeamName?: string;
  homeTeamShortName?: string;
  awayTeamShortName?: string;
  homeTeamLogoUrl?: string;
  awayTeamLogoUrl?: string;
  matchTime: Date;
  groupCode?: string | null;
  stageName?: string | null;
  status: "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED" | "CANCELLED";
  isKnockout: boolean;
  homeScore?: number | null;
  awayScore?: number | null;
  finishType?: "NINETY_MINUTES" | "EXTRA_TIME" | "PENALTIES" | null;
  penaltyWinnerTeamApiId?: string | null;
  scorers?: { playerApiId: string; goals: number }[];
};

export type SyncOptions = {
  leagueId?: string;
  season?: string;
  dateFrom?: string;
  dateTo?: string;
  /** SportScore: جلب المباريات الحية/الأخيرة فقط (أسرع للـ cron) */
  quickSync?: boolean;
};

export function resolveFootballApiProviderName(): string {
  return (process.env.FOOTBALL_API_PROVIDER ?? "api-football").trim();
}

export type ExternalMatchScorer = {
  playerApiId: string;
  goals: number;
  playerName?: string;
  teamApiId?: string;
  /** دقيقة الهدف (null إذا لم تكن متوفرة) */
  minute?: number | null;
};

export interface FootballApiProvider {
  name: string;
  fetchTeams(options: SyncOptions): Promise<ExternalTeam[]>;
  fetchPlayers(teamApiId: string, options: SyncOptions): Promise<ExternalPlayer[]>;
  fetchMatches(options: SyncOptions): Promise<ExternalMatch[]>;
  fetchMatchScorers(
    fixtureApiId: string,
    options: SyncOptions
  ): Promise<ExternalMatchScorer[]>;
}
