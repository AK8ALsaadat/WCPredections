"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { MatchCard } from "@/components/matches/MatchCard";
import { LoadingPage } from "@/components/ui/LoadingSpinner";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Select } from "@/components/ui/Select";
import { Pagination } from "@/components/ui/Pagination";
import { formatDayHeader, getPredictionTimezone, isPredictionAllowed } from "@/lib/utils";
import {
  prefetchPredictData,
  seedPredictMatchFromList,
} from "@/lib/predict-prefetch";
import {
  isClientCacheFresh,
  readClientCache,
  writeClientCache,
} from "@/lib/client-page-cache";
import { useI18n } from "@/lib/i18n/LocaleProvider";

type Round = { id: string; name: string };
type Match = Parameters<typeof MatchCard>[0]["match"];

type MatchesPageMeta = {
  page: number;
  totalPages: number;
  totalItems: number;
  pageKind: "open" | "other";
  openCount: number;
};

type MatchesPageCache = {
  matches: Match[];
  meta: MatchesPageMeta;
};

const REFRESH_MS = 300_000;

function matchesCacheKey(roundId: string, page: number) {
  return `matches:${roundId || "all"}:${page}`;
}

export default function MatchesPage() {
  const { messages: t, locale } = useI18n();
  const [rounds, setRounds] = useState<Round[]>(() =>
    readClientCache<Round[]>("rounds") ?? []
  );
  const [selectedRound, setSelectedRound] = useState("");
  const [page, setPage] = useState(1);
  const [matches, setMatches] = useState<Match[]>([]);
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

  const predictionTimezone = getPredictionTimezone();
  const cacheKey = matchesCacheKey(selectedRound, page);
  const loadSeq = useRef(0);

  const applyCache = useCallback((cached: MatchesPageCache, activePage: number) => {
    setMatches(cached.matches);
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
      const requestKey = matchesCacheKey(targetRound, targetPage);
      const seq = ++loadSeq.current;

      const cached = readClientCache<MatchesPageCache>(requestKey);
      if (cached && seq === loadSeq.current) {
        applyCache(cached, targetPage);
      }

      if (cached && !opts?.force && isClientCacheFresh(requestKey)) {
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
      });
      if (targetRound) params.set("roundId", targetRound);

      try {
        const res = await fetch(`/api/matches?${params}`, {
          signal: opts?.signal,
        });
        if (seq !== loadSeq.current) return;

        const data = await res.json();
        if (seq !== loadSeq.current) return;

        if (data.success) {
          const resolvedPage = data.data.page as number;
          const payload: MatchesPageCache = {
            matches: data.data.matches,
            meta: {
              page: resolvedPage,
              totalPages: data.data.totalPages,
              totalItems: data.data.totalItems,
              pageKind: data.data.pageKind,
              openCount: data.data.openCount,
            },
          };
          writeClientCache(matchesCacheKey(targetRound, resolvedPage), payload);
          setMatches(payload.matches);
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
    [applyCache]
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
    const cachedRounds = readClientCache<Round[]>("rounds");
    if (cachedRounds) setRounds(cachedRounds);

    fetch("/api/rounds")
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          writeClientCache("rounds", data.data);
          setRounds(data.data);
        }
      });
  }, []);

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
      signal: abort.signal,
    });

    return () => abort.abort();
  }, [applyCache, cacheKey, loadMatches, page, selectedRound]);

  useEffect(() => {
    const interval = setInterval(
      () => loadMatches(page, selectedRound, { force: true }),
      REFRESH_MS
    );
    return () => clearInterval(interval);
  }, [loadMatches, page, selectedRound]);

  useEffect(() => {
    matches
      .filter((m) => isPredictionAllowed(m.matchTime))
      .forEach((m) => {
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
  }, [matches]);

  const grouped = matches.reduce<Record<string, Match[]>>((acc, match) => {
    const d = new Date(match.matchTime);
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString();
    if (!acc[key]) acc[key] = [];
    acc[key].push(match);
    return acc;
  }, {});

  const sortedDays = Object.keys(grouped).sort();
  const pageLabel =
    meta.pageKind === "open" ? t.matches.pageOpen : t.matches.pageOther;

  if (loading && matches.length === 0) return <LoadingPage />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t.matches.title}</h1>
          <p className="mt-1 text-muted">{t.matches.subtitle}</p>
          {lastUpdate && (
            <p className="mt-1 text-xs text-muted">
              {t.matches.lastUpdate}:{" "}
              {lastUpdate.toLocaleTimeString(locale === "en" ? "en-US" : "ar-SA")}{" "}
              · {t.matches.dataSource}
              {refreshing && (
                <span className="mr-2 text-primary"> · {t.matches.refreshing}</span>
              )}
            </p>
          )}
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

      {matches.length === 0 ? (
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
                  {formatDayHeader(dayKey, locale)}
                </h3>
                <div className="grid gap-4 md:grid-cols-2">
                  {grouped[dayKey].map((match) => (
                    <MatchCard key={match.id} match={match} showPredictButton />
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
