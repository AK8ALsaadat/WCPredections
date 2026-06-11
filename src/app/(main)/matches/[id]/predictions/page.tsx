"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { LoadingPage } from "@/components/ui/LoadingSpinner";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { LeaguePredictionsList } from "@/components/matches/LeaguePredictionsList";
import { formatDate } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { LeagueMatchPredictionRow } from "@/types";

type LeaguePredictionsPayload = {
  match: {
    id: string;
    matchTime: string;
    status: string;
    isKnockout: boolean;
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
};

export default function LeagueMatchPredictionsPage() {
  const { messages: t, locale } = useI18n();
  const params = useParams();
  const matchId = params.id as string;
  const [data, setData] = useState<LeaguePredictionsPayload | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch(`/api/matches/${matchId}/predictions`).then((r) => r.json()),
      fetch("/api/auth/me").then((r) => r.json()),
    ])
      .then(([predData, meData]) => {
        if (predData.success) {
          setData(predData.data);
        } else {
          setError(predData.error ?? t.errors.loadFailed);
        }
        if (meData.success) {
          setCurrentUserId(meData.data.user?.userId);
        }
      })
      .catch(() => setError(t.errors.loadFailed))
      .finally(() => setLoading(false));
  }, [matchId, t.errors.loadFailed]);

  if (loading) return <LoadingPage />;
  if (error || !data) {
    return <ErrorMessage message={error || t.matches.notFound} />;
  }

  const { match, predictions } = data;
  const isFinished = match.status === "FINISHED";
  const withDouble = predictions.filter((p) => p.prediction?.isDouble).length;
  const withBold = predictions.filter((p) => p.boldScorerBet).length;

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-8">
      <Link
        href={`/matches/${matchId}`}
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        ← {t.matches.backToMatch}
      </Link>

      <header className="relative overflow-hidden rounded-2xl border border-card-border bg-gradient-to-b from-primary/10 via-card to-card p-6 shadow-xl shadow-black/25">
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

        <div className="mt-5 flex items-center justify-between gap-4">
          <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
            <TeamLogo {...match.homeTeam} size="lg" />
            <span className="font-bold">{match.homeTeam.shortName}</span>
          </div>

          <div className="shrink-0 px-2 text-center">
            <span className="text-2xl font-light text-muted">{t.matches.vs}</span>
            <p className="mt-2 text-xs text-muted">
              {formatDate(match.matchTime, locale)}
            </p>
            {match.isKnockout && (
              <span className="mt-2 inline-block rounded-full bg-warning/15 px-2.5 py-0.5 text-[10px] font-semibold text-warning">
                {t.matches.knockoutBadge}
              </span>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
            <TeamLogo {...match.awayTeam} size="lg" />
            <span className="font-bold">{match.awayTeam.shortName}</span>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-2 border-t border-card-border/60 pt-4 text-center">
          <div className="rounded-xl bg-background/40 px-2 py-2">
            <p className="text-lg font-bold text-primary">{predictions.length}</p>
            <p className="text-[10px] text-muted">
              {predictions.length === 1
                ? t.matches.predictorSingular
                : t.matches.predictorPlural}
            </p>
          </div>
          <div className="rounded-xl bg-background/40 px-2 py-2">
            <p className="text-lg font-bold text-warning">{withDouble}</p>
            <p className="text-[10px] text-muted">{t.matches.featureDouble}</p>
          </div>
          <div className="rounded-xl bg-background/40 px-2 py-2">
            <p className="text-lg font-bold text-amber-400">{withBold}</p>
            <p className="text-[10px] text-muted">{t.matches.featureBold}</p>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-card px-2 py-1 ring-1 ring-card-border">
          <span className="rounded bg-warning/20 px-1 text-[10px] font-bold text-warning">
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
        homeTeamName={match.homeTeam.name}
        awayTeamName={match.awayTeam.name}
        homeShortName={match.homeTeam.shortName}
        awayShortName={match.awayTeam.shortName}
        isKnockout={match.isKnockout}
        isFinished={isFinished}
        currentUserId={currentUserId}
      />
    </div>
  );
}
