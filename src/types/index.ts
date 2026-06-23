import type {
  FinishType,
  MatchStatus,
  Match,
  Prediction,
  Round,
  ScorerPrediction,
  Team,
  User,
  Player,
  MatchScorer,
} from "@prisma/client";
export type { FinishType, MatchStatus };

export type UserSession = {
  userId: string;
  username: string;
  isAdmin: boolean;
  hasSeenTutorial?: boolean;
  hasSeenKnockoutTutorial?: boolean;
};

export type TeamBasic = Pick<Team, "id" | "name" | "shortName" | "logoUrl">;

export type MatchWithTeams = Match & {
  homeTeam: TeamBasic;
  awayTeam: TeamBasic;
  penaltyWinnerTeam?: TeamBasic | null;
  round: Pick<Round, "id" | "name">;
};

export type PredictionWithMatch = Prediction & {
  match: MatchWithTeams;
};

export type ScorerPredictionWithPlayer = ScorerPrediction & {
  player: Pick<Player, "id" | "name" | "teamId">;
};

export type LeagueMatchPredictionRow = {
  userId: string;
  username: string;
  prediction: {
    predHome: number;
    predAway: number;
    isDouble: boolean;
    predictedFinishType: string | null;
    predictedPenaltyWinnerTeamId: string | null;
    points?: number;
    doubleBonus?: number;
    finishTypePoints?: number;
    penaltyWinnerPoints?: number;
  } | null;
  scorerPredictions: {
    player: { id: string; name: string; teamId: string };
    predictedGoals: number;
    points?: number;
  }[];
  boldScorerBet: {
    player: { id: string; name: string };
    points?: number;
  } | null;
  octopusGoalkeeperBet: {
    player: { id: string; name: string };
    points?: number;
    saves?: number | null;
    goalsConceded?: number | null;
  } | null;
};

export type LeaderboardEntry = {
  rank: number;
  userId: string;
  username: string;
  points: number;
  nightWindowPoints?: number;
  isNightChampion?: boolean;
  /** موجب = تحسّن الترتيب، سالب = تراجع مقارنة بالأسبوع الماضي */
  rankChange?: number;
  /** عدد الأيام المتتالية في الصدارة (يظهر فقط إذا >= 3) */
  streakDays?: number;
};

export type UserProfile = Pick<User, "id" | "username" | "createdAt"> & {
  totalPoints: number;
  roundPoints: Record<string, number>;
  predictionsCount: number;
  correctPredictions: number;
};

export type MatchDetail = MatchWithTeams & {
  predictions?: Prediction[];
  scorerPredictions?: ScorerPredictionWithPlayer[];
  matchScorers?: (MatchScorer & { player: Pick<Player, "id" | "name"> })[];
  homePlayers?: Pick<Player, "id" | "name">[];
  awayPlayers?: Pick<Player, "id" | "name">[];
};

export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string };

