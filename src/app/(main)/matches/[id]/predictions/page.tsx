"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { Card } from "@/components/ui/Card";
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

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href={`/matches/${matchId}`}
        className="text-sm text-primary hover:underline"
      >
        ← {t.matches.backToMatch}
      </Link>

      <Card>
        <h1 className="text-xl font-bold">{t.matches.allPredictionsTitle}</h1>
        <p className="mt-1 text-sm text-muted">{formatDate(match.matchTime, locale)}</p>

        <div className="mt-4 flex items-center justify-between gap-4 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <TeamLogo {...match.homeTeam} />
            <span className="truncate font-medium">{match.homeTeam.shortName}</span>
          </div>
          <span className="text-muted">{t.matches.vs}</span>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            <span className="truncate font-medium">{match.awayTeam.shortName}</span>
            <TeamLogo {...match.awayTeam} />
          </div>
        </div>

        <p className="text-sm text-muted">
          {predictions.length}{" "}
          {predictions.length === 1
            ? t.matches.predictorSingular
            : t.matches.predictorPlural}
        </p>
      </Card>

      <LeaguePredictionsList
        rows={predictions}
        homeTeamId={match.homeTeam.id}
        awayTeamId={match.awayTeam.id}
        homeTeamName={match.homeTeam.name}
        awayTeamName={match.awayTeam.name}
        isKnockout={match.isKnockout}
        isFinished={isFinished}
        currentUserId={currentUserId}
      />
    </div>
  );
}
