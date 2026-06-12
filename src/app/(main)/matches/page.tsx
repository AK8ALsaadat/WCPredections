"use client";

import Link from "next/link";
import { useEffect, useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
const MatchCard = dynamic(
  () => import("@/components/matches/MatchCard").then((m) => ({ default: m.MatchCard })),
  { loading: () => <div /> }
);
import { LoadingPage } from "@/components/ui/LoadingSpinner";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Select } from "@/components/ui/Select";
import { Pagination } from "@/components/ui/Pagination";
import {
  formatDayHeader,
  getMatchCalendarDay,
  getPredictionTimezone,
  isMatchStarted,
  isPredictionAllowed,
} from "@/lib/utils";
import {
  prefetchPredictData,
  seedPredictMatchFromList,
} from "@/lib/predict-prefetch";
import {
  invalidateClientCachePrefix,
  isClientCacheFresh,
  readClientCache,
  writeClientCache,
} from "@/lib/client-page-cache";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { clientFetch } from "@/lib/client-fetch";

type Round = { id: string; name: string };
type Match = {
  id: string;
  matchTime: string | Date;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  isKnockout: boolean;
  stageName?: string | null;
  homeTeam: { id: string; name: string; shortName: string; logoUrl?: string | null };
  awayTeam: { id: string; name: string; shortName: string; logoUrl?: string | null };
  round: { id: string; name: string };
  actualFinishType?: string | null;
  penaltyWinnerTeamId?: string | null;
  userPrediction?: {
    predHome: number;
    predAway: number;
    isDouble: boolean;
    points?: number;
    finishTypePoints?: number;
    penaltyWinnerPoints?: number;
    predictedFinishType?: string | null;
    predictedPenaltyWinnerTeamId?: string | null;
  } | null;
  userScorerPredictions?: { predictedGoals: number; points?: number; player: { id: string; name: string; teamId: string } }[];
  userBoldScorerBet?: { points: number; player: { name: string } } | null;
};

type MatchesPageMeta = {
  page: number;
  totalPages: number;
  totalItems: number;
  pageKind: "open" | "other";
  openCount: number;
};

type MatchesPageCache = {
  matches: Match[];
  pinnedMatches: Match[];
  meta: MatchesPageMeta;
};

const REFRESH_MS = 30_000;
const LIVE_REFRESH_MS = 5_000;
const MATCHES_CACHE_FRESH_MS = 15_000;

function matchesCacheKey(roundId: string, page: number, matchType: string) {
  return `matches:v3:${matchType}:${roundId || "all"}:${page}`;
}

export default function MatchesPage() {
  const { messages: t, locale } = useI18n();
  const [rounds, setRounds] = useState<Round[]>(() =>
    readClientCache<Round[]>("rounds") ?? []
  );
  const [selectedRound, setSelectedRound] = useState("");
  const [matchType, setMatchType] = useState<"upcoming" | "past">("upcoming");
  const [page, setPage] = useState(1);
  const [matches, setMatches] = useState<Match[]>([]);
  const [pinnedMatches, setPinnedMatches] = useState<Match[]>([]);
  const [meta, setMeta] = useState<MatchesPageMeta>({
    page: 1,
    totalPages: 1,
    totalItems: 0,
    pageKind: "open",
    openCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [dataSourceLabel, setDataSourceLabel] = useState(t.matches.dataSource);
  const [liveMatchesCount, setLiveMatchesCount] = useState(0);

  const predictionTimezone = getPredictionTimezone();
  const cacheKey = matchesCacheKey(selectedRound, page, matchType);
  const loadSeq = useRef(0);

  const applyCache = useCallback((cached: MatchesPageCache, activePage: number) => {
    setMatches(cached.matches);
    setPinnedMatches(cached.pinnedMatches ?? []);
    setMeta(cached.meta);
    setPage(activePage);
    setLoading(false);
  }, []);

  const loadMatches = useCallback(
    async (
      targetPage: number,
      targetRound: string,
      opts?: { showLoader?: boolean; force?: boolean; signal?: AbortSignal }
    ) => {
const requestKey = matchesCacheKey(targetRound, targetPage, matchType);
      const seq = ++loadSeq.current;

      const cached = readClientCache<MatchesPageCache>(requestKey);
      if (cached && seq === loadSeq.current) {
        applyCache(cached, targetPage);
      }

      const hasLiveInCache = cached?.matches.some((m) => m.status === "LIVE");
      if (
        cached &&
        !opts?.force &&
        !hasLiveInCache &&
        isClientCacheFresh(requestKey, MATCHES_CACHE_FRESH_MS)
      ) {
        return;
      }

      if (opts?.showLoader && !cached) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      const params = new URLSearchParams({
        schedule: "true",
        paginated: "true",
        page: String(targetPage),
        light: matchType === "upcoming" ? "1" : "0",
      });
      if (matchType === "past") params.set("completed", "true");
      if (targetRound) params.set("roundId", targetRound);

      try {
        const res = await clientFetch(`/api/matches?${params}`, {
          signal: opts?.signal,
        });
        if (!res) throw new Error("NetworkError");
        if (seq !== loadSeq.current) return;

        const data = await res.json();
        if (seq !== loadSeq.current) return;

        if (data.success) {
          const resolvedPage = data.data.page as number;
          const payload: MatchesPageCache = {
            matches: data.data.matches,
            pinnedMatches: data.data.pinnedMatches ?? [],
            meta: {
              page: resolvedPage,
              totalPages: data.data.totalPages,
              totalItems: data.data.totalItems,
              pageKind: data.data.pageKind,
              openCount: data.data.openCount,
            },
          };
          writeClientCache(matchesCacheKey(targetRound, resolvedPage, matchType), payload);
          setMatches(payload.matches);
          setPinnedMatches(payload.pinnedMatches);
          setMeta(payload.meta);
          setPage(resolvedPage);
          setLastUpdate(new Date());
          setError("");
        } else {
          setError(data.error);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (seq !== loadSeq.current) return;
        if (!cached) setError(t.errors.loadFailed);
      } finally {
        if (seq === loadSeq.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [applyCache, matchType]
  );

  const handlePageChange = useCallback(
    (nextPage: number) => {
      if (nextPage < 1 || nextPage > meta.totalPages) return;
      setPage(nextPage);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [meta.totalPages]
  );

  useEffect(() => {
    void clientFetch("/api/health")
      .then((r) => (r ? r.json() : null))
      .then((data) => {
        if (!data || !data.success) return;
        if (data.data.footballApi === "sportscore") {
          setDataSourceLabel(t.matches.dataSourceSportScore);
        }
        const live = data.data.liveMatches?.length ?? 0;
        setLiveMatchesCount(live);
      })
      .catch(() => {});
  }, [t.matches.dataSource, t.matches.dataSourceSportScore]);

  useEffect(() => {
    const cachedRounds = readClientCache<Round[]>("rounds");
    if (cachedRounds) setRounds(cachedRounds);

    void clientFetch("/api/rounds")
      .then((r) => (r ? r.json() : null))
      .then((data) => {
        if (data.success) {
          writeClientCache("rounds", data.data);
          setRounds(data.data);
        }
      });
  }, []);

  useEffect(() => {
    for (const key of [
      `matches:upcoming:${selectedRound || "all"}:1`,
      `matches:past:${selectedRound || "all"}:${page}`,
    ]) {
      const cached = readClientCache<MatchesPageCache>(key);
      const hasStaleScheduled = [...(cached?.matches ?? []), ...(cached?.pinnedMatches ?? [])].some(
        (m) => m.status === "SCHEDULED" && isMatchStarted(m.matchTime)
      );
      if (hasStaleScheduled) {
        invalidateClientCachePrefix("matches:");
        break;
      }
    }
  }, [page, selectedRound]);

  useEffect(() => {
    setPage(1);
  }, [matchType]);

  useEffect(() => {
    setMatches([]);
    setPinnedMatches([]);
    setLoading(true);
  }, [matchType, selectedRound]);

  useEffect(() => {
    const abort = new AbortController();
    const cached = readClientCache<MatchesPageCache>(cacheKey);

    if (cached) {
      applyCache(cached, cached.meta.page);
    } else {
      setLoading(true);
    }

    void loadMatches(page, selectedRound, {
      showLoader: !cached,
      force: true,
      signal: abort.signal,
    });

    return () => abort.abort();
  }, [applyCache, cacheKey, loadMatches, page, selectedRound, matchType]);

  const hasLiveMatches = [...pinnedMatches, ...matches].some(
    (m) => m.status === "LIVE"
  );

  useEffect(() => {
    const intervalMs = hasLiveMatches ? LIVE_REFRESH_MS : REFRESH_MS;
    const interval = setInterval(
      () => loadMatches(page, selectedRound, { force: true }),
      intervalMs
    );
    return () => clearInterval(interval);
  }, [hasLiveMatches, loadMatches, page, selectedRound]);

  useEffect(() => {
    // Limit seeding to a small set to avoid many simultaneous requests
    const candidates = [...pinnedMatches, ...matches].filter((m) => isPredictionAllowed(m.matchTime));
    const MAX_PREFETCH = 2;
    const toProcess = candidates.slice(0, MAX_PREFETCH);

    toProcess.forEach((m) => {
      seedPredictMatchFromList({
        id: m.id,
        matchTime: m.matchTime,
        isKnockout: m.isKnockout,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        userPrediction: m.userPrediction
          ? {
              predHome: m.userPrediction.predHome,
              predAway: m.userPrediction.predAway,
              isDouble: m.userPrediction.isDouble,
              predictedFinishType: m.userPrediction.predictedFinishType,
              predictedPenaltyWinnerTeamId:
                m.userPrediction.predictedPenaltyWinnerTeamId,
            }
          : null,
        userScorerPredictions: m.userScorerPredictions?.map((sp) => ({
          playerId: sp.player.id,
          predictedGoals: sp.predictedGoals,
        })),
      });
      prefetchPredictData(m.id);
    });
  }, [matches, pinnedMatches]);

  const pinnedIds = new Set(pinnedMatches.map((m) => m.id));
  const regularMatches = matches.filter((m) => !pinnedIds.has(m.id));

  const grouped = regularMatches.reduce<Record<string, Match[]>>((acc, match) => {
    const key = getMatchCalendarDay(match.matchTime);
    if (!acc[key]) acc[key] = [];
    acc[key].push(match);
    return acc;
  }, {});

  const sortedDays = Object.keys(grouped).sort();
  const showPinnedSection = page === 1 && pinnedMatches.length > 0;
  const pageLabel =
    meta.pageKind === "open" ? t.matches.pageOpen : t.matches.pageOther;

  if (loading && matches.length === 0) return <LoadingPage />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t.matches.title}</h1>
          <p className="mt-1 text-muted">{t.matches.subtitle}</p>
          {lastUpdate && (
            <p className="mt-1 text-xs text-muted">
              {t.matches.lastUpdate}:{" "}
              {lastUpdate.toLocaleTimeString(locale === "en" ? "en-US" : "ar-SA")}{" "}
              · {dataSourceLabel}
              {liveMatchesCount > 0 && (
                <span className="mr-1 font-medium text-primary">
                  {" "}
                  · {t.matches.liveMatchesConnected(liveMatchesCount)}
                </span>
              )}
              {refreshing && (
                <span className="mr-2 text-primary"> · {t.matches.refreshing}</span>
              )}
            </p>
          )}
        </div>

        <div className="flex gap-2 border-b border-card-border pb-3">
          <button
            onClick={() => setMatchType("upcoming")}
            className={`px-4 py-2 font-medium rounded-t transition ${
              matchType === "upcoming"
                ? "bg-primary text-white"
                : "bg-card text-muted hover:text-foreground"
            }`}
          >
            المباريات القادمة
          </button>
          <button
            onClick={() => setMatchType("past")}
            className={`px-4 py-2 font-medium rounded-t transition ${
              matchType === "past"
                ? "bg-primary text-white"
                : "bg-card text-muted hover:text-foreground"
            }`}
          >
            المباريات المتوقعة
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
        </div>
        {rounds.length > 0 && (
          <div className="w-full sm:w-64">
            <Select
              label={t.matches.filterRound}
              value={selectedRound}
              onChange={(e) => {
                setSelectedRound(e.target.value);
                setPage(1);
              }}
              options={[
                { value: "", label: t.matches.allRounds },
                ...rounds.map((r) => ({ value: r.id, label: r.name })),
              ]}
            />
          </div>
        )}
      </div>

      <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
        {t.matches.lockNotice}
      </div>

      <p className="text-sm text-muted">
        {t.matches.predictWindow}{" "}
        <span className="text-primary">
          ({formatDayHeader(new Date(), locale)} — {predictionTimezone})
        </span>
      </p>

      {error && <ErrorMessage message={error} />}

      {showPinnedSection && (
        <section className="mb-8 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2 border-b border-primary/30 pb-3">
            <div>
              <h2 className="text-lg font-semibold text-primary">
                {t.matches.yourFinalPredictions}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {t.matches.yourFinalPredictionsHint}
              </p>
            </div>
            <Link
              href="/predictions"
              className="text-xs font-medium text-primary hover:underline"
            >
              {t.predictions.title} →
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {pinnedMatches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                showPredictButton
                finalPrediction
                isPastMatch={matchType === "past"}
              />
            ))}
          </div>
        </section>
      )}

      {matches.length === 0 && pinnedMatches.length === 0 ? (
        <div className="rounded-xl border border-card-border bg-card p-12 text-center text-muted">
          <p>{t.matches.noMatches}</p>
          <p className="mt-2 text-xs">{t.matches.syncHint}</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-primary">{pageLabel}</h2>
            {meta.openCount > 0 && meta.pageKind === "open" && (
              <span className="text-sm text-muted">
                {t.matches.openMatchesCount(meta.openCount)}
              </span>
            )}
          </div>

          <div className="space-y-8">
            {sortedDays.map((dayKey) => (
              <section key={dayKey}>
                <h3 className="mb-4 border-b border-card-border pb-2 text-base font-semibold text-foreground">
                  {formatDayHeader(`${dayKey}T12:00:00`, locale)}
                </h3>
                <div className="grid gap-4 md:grid-cols-2">
                  {grouped[dayKey].map((match) => (
                    <MatchCard 
                      key={match.id} 
                      match={match} 
                      showPredictButton 
                      isPastMatch={matchType === "past"}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>

          <Pagination
            page={page}
            totalPages={meta.totalPages}
            onPageChange={handlePageChange}
            labels={{
              previous: t.matches.paginationPrevious,
              next: t.matches.paginationNext,
              pageOf: t.matches.paginationPageOf,
            }}
          />
        </div>
      )}
    </div>
  );
}
