import { normalizePlayerName } from "@/lib/player-matching";
import type { ExternalMatchScorer } from "./types";

type EspnTeam = {
  id?: string;
  displayName?: string;
  shortDisplayName?: string;
  abbreviation?: string;
};

type EspnCompetitor = {
  homeAway?: "home" | "away";
  score?: string;
  team?: EspnTeam;
  statistics?: Array<{
    name?: string;
    displayValue?: string;
    value?: number;
  }>;
};

type EspnAthlete = {
  id?: string;
  displayName?: string;
  fullName?: string;
};

type EspnDetail = {
  scoringPlay?: boolean;
  ownGoal?: boolean;
  shootout?: boolean;
  type?: { text?: string };
  clock?: { value?: number; displayValue?: string };
  team?: { id?: string };
  athlete?: EspnAthlete;
  athletes?: EspnAthlete[];
  athletesInvolved?: EspnAthlete[];
  participants?: Array<{ athlete?: EspnAthlete }>;
};

type EspnCompetition = {
  competitors?: EspnCompetitor[];
  details?: EspnDetail[];
};

type EspnEvent = {
  id?: string;
  date?: string;
  status?: {
    type?: {
      state?: "pre" | "in" | "post";
      completed?: boolean;
    };
  };
  competitions?: EspnCompetition[];
};

type EspnScoreboard = {
  events?: EspnEvent[];
};

export type EspnLiveMatchInput = {
  matchTime: Date;
  homeTeamName: string;
  awayTeamName: string;
};

export type EspnLiveMatchSnapshot = {
  sourceId: string;
  status: "SCHEDULED" | "LIVE" | "FINISHED";
  homeScore: number;
  awayScore: number;
  scorers: ExternalMatchScorer[];
  scorersComplete: boolean;
};

export type EspnGoalkeeperTeamSavesSnapshot = {
  sourceId: string;
  homeSaves: number;
  awaySaves: number;
};

const SCOREBOARD_TTL_MS = 3_000;
const scoreboardCache = new Map<
  string,
  { expiresAt: number; promise: Promise<EspnEvent[]> }
>();

function slugify(text: string) {
  return normalizePlayerName(text).replace(/\s+/g, "-");
}

function teamTokens(name: string) {
  const ignored = new Set([
    "and",
    "the",
    "of",
    "fc",
    "cf",
    "national",
    "team",
    "republic",
  ]);

  return normalizePlayerName(name)
    .split(/\s+/)
    .filter((token) => token && !ignored.has(token));
}

function teamSimilarity(expected: string, candidate: EspnTeam | undefined) {
  if (!candidate) return 0;

  const candidateNames = [
    candidate.displayName,
    candidate.shortDisplayName,
    candidate.abbreviation,
  ].filter((value): value is string => Boolean(value));

  let best = 0;
  for (const candidateName of candidateNames) {
    const expectedNormalized = normalizePlayerName(expected);
    const candidateNormalized = normalizePlayerName(candidateName);
    if (expectedNormalized === candidateNormalized) return 1;
    if (
      expectedNormalized.includes(candidateNormalized) ||
      candidateNormalized.includes(expectedNormalized)
    ) {
      best = Math.max(best, 0.9);
    }

    const expectedTokens = teamTokens(expected);
    const candidateTokens = new Set(teamTokens(candidateName));
    if (expectedTokens.length > 0) {
      const overlap = expectedTokens.filter((token) =>
        candidateTokens.has(token)
      ).length;
      best = Math.max(
        best,
        overlap / Math.max(expectedTokens.length, candidateTokens.size, 1)
      );
    }
  }

  return best;
}

function parseScore(value: string | undefined) {
  const score = Number.parseInt(value ?? "0", 10);
  return Number.isFinite(score) ? score : 0;
}

function parseStatisticNumber(
  competitor: EspnCompetitor,
  statName: string
) {
  const stat = competitor.statistics?.find((row) => row.name === statName);
  if (!stat) return null;
  if (typeof stat.value === "number" && Number.isFinite(stat.value)) {
    return stat.value;
  }
  const parsed = Number.parseFloat(stat.displayValue ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

function parseMinute(detail: EspnDetail) {
  if (typeof detail.clock?.value === "number") {
    return Math.max(1, Math.ceil(detail.clock.value / 60));
  }

  const display = detail.clock?.displayValue?.match(/\d+/)?.[0];
  return display ? Number.parseInt(display, 10) : null;
}

function scorerAthlete(detail: EspnDetail) {
  return (
    detail.athlete ??
    detail.athletes?.[0] ??
    detail.athletesInvolved?.[0] ??
    detail.participants?.[0]?.athlete
  );
}

function eventStatus(event: EspnEvent): EspnLiveMatchSnapshot["status"] {
  if (event.status?.type?.completed || event.status?.type?.state === "post") {
    return "FINISHED";
  }
  if (event.status?.type?.state === "in") return "LIVE";
  return "SCHEDULED";
}

function findEvent(events: EspnEvent[], input: EspnLiveMatchInput) {
  const candidates = events
    .map((event) => {
      const competition = event.competitions?.[0];
      const home = competition?.competitors?.find(
        (row) => row.homeAway === "home"
      );
      const away = competition?.competitors?.find(
        (row) => row.homeAway === "away"
      );
      const teamScore =
        teamSimilarity(input.homeTeamName, home?.team) +
        teamSimilarity(input.awayTeamName, away?.team);
      const timeDistance = event.date
        ? Math.abs(new Date(event.date).getTime() - input.matchTime.getTime())
        : Number.MAX_SAFE_INTEGER;

      return { event, teamScore, timeDistance };
    })
    .filter((row) => row.teamScore >= 1.2)
    .sort(
      (a, b) =>
        b.teamScore - a.teamScore || a.timeDistance - b.timeDistance
    );

  return candidates[0]?.event ?? null;
}

export function parseEspnLiveMatch(
  events: EspnEvent[],
  input: EspnLiveMatchInput
): EspnLiveMatchSnapshot | null {
  const event = findEvent(events, input);
  const competition = event?.competitions?.[0];
  if (!event || !competition) return null;

  const home = competition.competitors?.find(
    (row) => row.homeAway === "home"
  );
  const away = competition.competitors?.find(
    (row) => row.homeAway === "away"
  );
  if (!home || !away) return null;

  const homeScore = parseScore(home.score);
  const awayScore = parseScore(away.score);
  const homeTeamSourceId = home.team?.id;
  const awayTeamSourceId = away.team?.id;
  const scorersByPlayer = new Map<string, ExternalMatchScorer>();

  for (const detail of competition.details ?? []) {
    const typeText = detail.type?.text?.toLowerCase() ?? "";
    if (!detail.scoringPlay || detail.shootout) {
      continue;
    }

    const athlete = scorerAthlete(detail);
    const isOwnGoal = detail.ownGoal || typeText.includes("own goal");
    const playerName = isOwnGoal
      ? "Own goal"
      : athlete?.fullName ?? athlete?.displayName;
    const sourcePlayerId = isOwnGoal
      ? `own-goal:${detail.team?.id ?? "unknown"}`
      : athlete?.id;
    if (!sourcePlayerId || !playerName) continue;

    const teamApiId =
      detail.team?.id === homeTeamSourceId
        ? slugify(input.homeTeamName)
        : detail.team?.id === awayTeamSourceId
          ? slugify(input.awayTeamName)
          : undefined;
    if (!teamApiId) continue;

    const playerApiId = `espn:${sourcePlayerId}`;
    const existing = scorersByPlayer.get(playerApiId);
    scorersByPlayer.set(playerApiId, {
      playerApiId,
      playerName,
      teamApiId,
      goals: (existing?.goals ?? 0) + 1,
      minute: existing?.minute ?? parseMinute(detail),
    });
  }

  const scorers = Array.from(scorersByPlayer.values());
  const scorerGoalCount = scorers.reduce((sum, row) => sum + row.goals, 0);

  return {
    sourceId: event.id ?? "",
    status: eventStatus(event),
    homeScore,
    awayScore,
    scorers,
    scorersComplete: scorerGoalCount === homeScore + awayScore,
  };
}

export function parseEspnGoalkeeperTeamSaves(
  events: EspnEvent[],
  input: EspnLiveMatchInput
): EspnGoalkeeperTeamSavesSnapshot | null {
  const event = findEvent(events, input);
  const competition = event?.competitions?.[0];
  if (!event || !competition) return null;

  const home = competition.competitors?.find(
    (row) => row.homeAway === "home"
  );
  const away = competition.competitors?.find(
    (row) => row.homeAway === "away"
  );
  if (!home || !away) return null;

  const homeShotsOnTarget = parseStatisticNumber(home, "shotsOnTarget");
  const awayShotsOnTarget = parseStatisticNumber(away, "shotsOnTarget");
  if (homeShotsOnTarget == null || awayShotsOnTarget == null) return null;

  const homeScore = parseScore(home.score);
  const awayScore = parseScore(away.score);

  return {
    sourceId: event.id ?? "",
    homeSaves: Math.max(0, Math.round(awayShotsOnTarget - awayScore)),
    awaySaves: Math.max(0, Math.round(homeShotsOnTarget - homeScore)),
  };
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

async function fetchScoreboard(key: string) {
  const cached = scoreboardCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;

  const promise = fetch(
    `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${key}`,
    {
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
      headers: { Accept: "application/json" },
    }
  ).then(async (response) => {
    if (!response.ok) {
      throw new Error(`ESPN scoreboard returned ${response.status}`);
    }
    const payload = (await response.json()) as EspnScoreboard;
    return payload.events ?? [];
  });

  scoreboardCache.set(key, {
    expiresAt: Date.now() + SCOREBOARD_TTL_MS,
    promise,
  });

  try {
    return await promise;
  } catch (error) {
    scoreboardCache.delete(key);
    throw error;
  }
}

export async function fetchEspnLiveMatch(
  input: EspnLiveMatchInput
): Promise<EspnLiveMatchSnapshot | null> {
  const keys = new Set<string>();
  for (const offset of [-1, 0, 1]) {
    const date = new Date(input.matchTime);
    date.setUTCDate(date.getUTCDate() + offset);
    keys.add(dateKey(date));
  }

  const eventGroups = await Promise.all(
    Array.from(keys).map((key) => fetchScoreboard(key))
  );

  return parseEspnLiveMatch(eventGroups.flat(), input);
}

export async function fetchEspnGoalkeeperTeamSaves(
  input: EspnLiveMatchInput
): Promise<EspnGoalkeeperTeamSavesSnapshot | null> {
  const keys = new Set<string>();
  for (const offset of [-1, 0, 1]) {
    const date = new Date(input.matchTime);
    date.setUTCDate(date.getUTCDate() + offset);
    keys.add(dateKey(date));
  }

  const eventGroups = await Promise.all(
    Array.from(keys).map((key) => fetchScoreboard(key))
  );

  return parseEspnGoalkeeperTeamSaves(eventGroups.flat(), input);
}
