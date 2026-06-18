"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { LoadingPage } from "@/components/ui/LoadingSpinner";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { LeaguePredictionsList } from "@/components/matches/LeaguePredictionsList";
import { asFinishType } from "@/lib/finish-type";
import { formatDate, isMatchStarted } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { clientFetch } from "@/lib/client-fetch";
import {
  isLeaguePredictionsCacheFresh,
  readLeaguePredictionsCache,
  writeLeaguePredictionsCache,
} from "@/lib/league-predictions-prefetch";
import { getSaudiLossDisplayTeam } from "@/lib/saudi-kuwait-joke";
import type { LeagueMatchPredictionRow } from "@/types";

type LeaguePredictionsPayload = {
  match: {
    id: string;
    matchTime: string;
    status: string;
    isKnockout: boolean;
    homeScore?: number | null;
    awayScore?: number | null;
    actualFinishType?: string | null;
    penaltyWinnerTeamId?: string | null;
    penaltyWinnerTeam?: { id: string; name: string; shortName: string } | null;
    homeTeam: {
      id: string;
      name: string;
      shortName: string;
      logoUrl?: string | null;
    };
    awayTeam: {
      id: string;
      name: string;
      shortName: string;
      logoUrl?: string | null;
    };
  };
  predictions: LeagueMatchPredictionRow[];
  currentUserId?: string;
};

export default function LeagueMatchPredictionsPage() {
  const { messages: t, locale } = useI18n();
  const params = useParams();
  const matchId = params.id as string;
  const initialCache =
    readLeaguePredictionsCache<LeaguePredictionsPayload>(matchId);
  const [data, setData] = useState<LeaguePredictionsPayload | null>(
    initialCache
  );
  const [loading, setLoading] = useState(!initialCache);
  const [error, setError] = useState("");

  const loadPredictions = useCallback(async (force = false) => {
    const cached =
      readLeaguePredictionsCache<LeaguePredictionsPayload>(matchId);
    if (cached) {
      setData(cached);
      setLoading(false);
      if (!force && isLeaguePredictionsCacheFresh(matchId)) return;
    }

    const predRes = await clientFetch(`/api/matches/${matchId}/predictions`);
    const predData = predRes ? await predRes.json() : null;

    if (predData?.success) {
      writeLeaguePredictionsCache(matchId, predData.data);
      setData(predData.data);
      setError("");
    } else if (!cached) {
      setError(predData?.error ?? t.errors.loadFailed);
    }
  }, [matchId, t.errors.loadFailed]);

  useEffect(() => {
    loadPredictions()
      .catch(() => setError(t.errors.loadFailed))
      .finally(() => setLoading(false));
  }, [loadPredictions, t.errors.loadFailed]);

  useEffect(() => {
    const shouldPoll =
      data?.match.status === "LIVE" ||
      (data?.match.matchTime && isMatchStarted(data.match.matchTime));
    if (!shouldPoll) return;

    const events = new EventSource("/api/events");
    const onScoringUpdate = (event: Event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data);
        if (payload?.matchId === matchId) {
          void loadPredictions(true).catch(() => {});
        }
      } catch {
        // The fallback timer handles malformed or missed events.
      }
    };
    events.addEventListener("match-scoring-updated", onScoringUpdate);

    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadPredictions(true).catch(() => {});
      }
    }, 15_000);

    return () => {
      clearInterval(timer);
      events.removeEventListener("match-scoring-updated", onScoringUpdate);
      events.close();
    };
  }, [
    data?.match.status,
    data?.match.matchTime,
    loadPredictions,
    matchId,
  ]);

  if (loading) return <LoadingPage />;
  if (error || !data) {
    return <ErrorMessage message={error || t.matches.notFound} />;
  }

  const { match, predictions } = data;
  const homeTeamDisplay = getSaudiLossDisplayTeam(
    match.homeTeam,
    match.homeScore,
    match.awayScore,
    true
  );
  const awayTeamDisplay = getSaudiLossDisplayTeam(
    match.awayTeam,
    match.homeScore,
    match.awayScore,
    false
  );
  const isLive = match.status === "LIVE";
  const isFinished =
    match.status === "FINISHED" &&
    match.homeScore != null &&
    match.awayScore != null;
  const hasLiveScore =
    isLive && match.homeScore != null && match.awayScore != null;
  const withDouble = predictions.filter((p) => p.prediction?.isDouble).length;
  const withBold = predictions.filter((p) => p.boldScorerBet).length;
  const hasScoringContext =
    match.homeScore != null &&
    match.awayScore != null &&
    (match.status === "FINISHED" || match.status === "LIVE");

  const matchResult = hasScoringContext
    ? {
        homeScore: match.homeScore!,
        awayScore: match.awayScore!,
        isKnockout: match.isKnockout,
        actualFinishType: asFinishType(match.actualFinishType),
        penaltyWinnerTeamId: match.penaltyWinnerTeamId,
        homeTeamName: homeTeamDisplay.name,
        awayTeamName: awayTeamDisplay.name,
        penaltyWinnerName: match.penaltyWinnerTeam?.name ?? null,
      }
    : null;

  return (
    <div className="w-full space-y-4 pb-4 md:space-y-6 md:pb-8">
      <Link
        href={`/matches/${matchId}`}
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        ← {t.matches.backToMatch}
      </Link>

      <header className="relative overflow-hidden rounded-xl border border-card-border bg-gradient-to-b from-primary/10 via-card to-card p-4 shadow-xl shadow-black/25 md:rounded-2xl md:p-6">
        <div
          className="pointer-events-none absolute -end-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-20 -start-10 h-40 w-40 rounded-full bg-accent/10 blur-3xl"
          aria-hidden
        />

        <p className="text-center text-xs font-medium uppercase tracking-widest text-primary">
          {t.matches.allPredictionsTitle}
        </p>

        <div
          className="mt-4 flex items-center justify-between gap-2 md:mt-5 md:gap-4"
          dir="ltr"
        >
          <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center">
            <TeamLogo {...homeTeamDisplay} size="lg" />
            <span className="truncate text-sm font-bold md:text-base">
              {homeTeamDisplay.shortName}
            </span>
          </div>

          <div className="shrink-0 px-1 text-center md:px-2">
            {hasLiveScore || isFinished ? (
              <div className="text-2xl font-bold tabular-nums md:text-3xl">
                {match.homeScore}
                <span className="mx-1 text-muted md:mx-2">-</span>
                {match.awayScore}
              </div>
            ) : (
              <span className="text-xl font-light text-muted md:text-2xl">
                {t.matches.vs}
              </span>
            )}
            {hasLiveScore && (
              <p className="mt-1 text-[10px] font-semibold text-warning">
                {t.status.LIVE}
              </p>
            )}
            {isFinished && (
              <p className="mt-1 text-[10px] font-medium text-primary">
                {t.matches.actualResult}
              </p>
            )}
            <p className="mt-2 text-xs text-muted">
              {formatDate(match.matchTime, locale)}
            </p>
            {match.isKnockout && (
              <span className="mt-2 inline-block rounded-full bg-warning/15 px-2.5 py-0.5 text-[10px] font-semibold text-warning">
                {t.matches.knockoutBadge}
              </span>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center">
            <TeamLogo {...awayTeamDisplay} size="lg" />
            <span className="truncate text-sm font-bold md:text-base">
              {awayTeamDisplay.shortName}
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-1.5 border-t border-card-border/60 pt-3 text-center md:mt-6 md:gap-2 md:pt-4">
          <div className="rounded-xl bg-background/40 px-2 py-2">
            <p className="text-lg font-bold text-primary">{predictions.length}</p>
            <p className="text-[10px] text-muted">
              {predictions.length === 1
                ? t.matches.predictorSingular
                : t.matches.predictorPlural}
            </p>
          </div>
          <div className="rounded-xl border border-orange-400/30 bg-gradient-to-br from-orange-950/70 to-amber-500/10 px-2 py-2 shadow-lg shadow-orange-950/20">
            <p className="text-lg font-black text-orange-300">{withDouble}</p>
            <p className="text-[10px] text-muted">{t.matches.featureDouble}</p>
          </div>
          <div className="rounded-xl border border-red-400/30 bg-gradient-to-br from-red-950/70 to-rose-500/10 px-2 py-2 shadow-lg shadow-red-950/20">
            <p className="text-lg font-black text-red-300">{withBold}</p>
            <p className="text-[10px] text-muted">{t.matches.featureBold}</p>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted md:gap-3 md:text-xs">
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-card px-2 py-1 ring-1 ring-card-border">
          <span className="rounded bg-orange-500/25 px-1.5 text-[10px] font-black text-orange-200 ring-1 ring-orange-300/60">
            2×
          </span>
          {t.matches.featureDouble}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-card px-2 py-1 ring-1 ring-card-border">
          <span className="text-amber-400">✦</span>
          {t.matches.featureBold}
        </span>
        {match.isKnockout && (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-card px-2 py-1 ring-1 ring-card-border">
            <span className="text-accent">ET / PK</span>
            {t.matches.knockoutExtrasLegend}
          </span>
        )}
      </div>

      <LeaguePredictionsList
        rows={predictions}
        homeTeamId={match.homeTeam.id}
        awayTeamId={match.awayTeam.id}
        homeTeam={homeTeamDisplay}
        awayTeam={awayTeamDisplay}
        homeShortName={homeTeamDisplay.shortName}
        awayShortName={awayTeamDisplay.shortName}
        isKnockout={match.isKnockout}
        isFinished={isFinished}
        matchStatus={match.status}
        matchResult={matchResult}
        currentUserId={data.currentUserId}
      />
    </div>
  );
}
