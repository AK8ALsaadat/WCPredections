"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { clientFetch } from "@/lib/client-fetch";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { LoadingPage } from "@/components/ui/LoadingSpinner";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Button } from "@/components/ui/Button";
import { PredictionCountdown } from "@/components/matches/PredictionCountdown";
import { PredictNavLink } from "@/components/matches/PredictNavLink";
import { ViewLeaguePredictionsButton } from "@/components/matches/ViewLeaguePredictionsButton";
import dynamic from "next/dynamic";
const MatchPointsBreakdown = dynamic(
  () => import("@/components/matches/MatchPointsBreakdown").then((m) => ({ default: m.MatchPointsBreakdown })),
  { loading: () => <div /> }
);
import { asFinishType } from "@/lib/finish-type";
import { formatDate, isPredictionAllowed } from "@/lib/utils";
import {
  prefetchPredictData,
  seedPredictMatchFromList,
} from "@/lib/predict-prefetch";
import {
  isMatchDetailCacheFresh,
  readMatchDetailCache,
  writeMatchDetailCache,
} from "@/lib/match-detail-cache";
import { useI18n } from "@/lib/i18n/LocaleProvider";

export default function MatchDetailPage() {
  const { messages: t, locale } = useI18n();
  const params = useParams();
  const matchId = params.id as string;
  const [match, setMatch] = useState<Record<string, unknown> | null>(() =>
    readMatchDetailCache<Record<string, unknown>>(matchId)
  );
  const [loading, setLoading] = useState(
    () => !readMatchDetailCache<Record<string, unknown>>(matchId)
  );
  const [error, setError] = useState("");

  const loadMatch = useCallback(
    (opts?: { silent?: boolean }) => {
      const cached = readMatchDetailCache<Record<string, unknown>>(matchId);
      if (cached && !opts?.silent) {
        setMatch(cached);
        setLoading(false);
      }
      if (cached && !opts?.silent && isMatchDetailCacheFresh(matchId)) {
        return Promise.resolve();
      }
      if (!opts?.silent && !cached) setLoading(true);
      return clientFetch(`/api/matches/${matchId}`)
        .then((r) => (r ? r.json() : null))
        .then((data) => {
          if (data.success) {
            setMatch(data.data);
            writeMatchDetailCache(matchId, data.data);
            const m = data.data as {
              id: string;
              matchTime: string;
              isKnockout: boolean;
              homeTeam: { id: string; name: string; shortName: string; logoUrl?: string | null };
              awayTeam: { id: string; name: string; shortName: string; logoUrl?: string | null };
              userPrediction?: {
                predHome: number;
                predAway: number;
                isDouble: boolean;
                predictedFinishType?: string | null;
                predictedPenaltyWinnerTeamId?: string | null;
              } | null;
              userScorerPredictions?: {
                player: { id: string };
                predictedGoals: number;
              }[];
            };
            if (isPredictionAllowed(m.matchTime)) {
              seedPredictMatchFromList({
                id: m.id,
                matchTime: m.matchTime,
                isKnockout: m.isKnockout,
                homeTeam: m.homeTeam,
                awayTeam: m.awayTeam,
                userPrediction: m.userPrediction ?? null,
                userScorerPredictions: m.userScorerPredictions?.map((sp) => ({
                  playerId: sp.player.id,
                  predictedGoals: sp.predictedGoals,
                })),
              });
              void prefetchPredictData(matchId);
            }
          } else {
            setError(data.error);
          }
        })
        .catch(() => setError(t.errors.loadFailed))
        .finally(() => {
          if (!opts?.silent) setLoading(false);
        });
    },
    [matchId, t.errors.loadFailed]
  );

  useEffect(() => {
    void loadMatch();
  }, [loadMatch]);

  useEffect(() => {
    if (match?.status !== "LIVE") return;
    const interval = setInterval(() => {
      void loadMatch({ silent: true });
    }, 30_000);
    return () => clearInterval(interval);
  }, [match?.status, loadMatch]);

  if (loading) return <LoadingPage />;
  if (error || !match) return <ErrorMessage message={error || t.matches.notFound} />;

  const m = match as {
    id: string;
    matchTime: string;
    status: string;
    homeScore: number | null;
    awayScore: number | null;
    isKnockout: boolean;
    actualFinishType: string | null;
    penaltyWinnerTeamId: string | null;
    homeTeam: { id: string; name: string; shortName: string; logoUrl?: string | null };
    awayTeam: { id: string; name: string; shortName: string; logoUrl?: string | null };
    round: { id: string; name: string };
    matchScorers: { player: { name: string }; goals: number }[];
    userPrediction: {
      predHome: number;
      predAway: number;
      isDouble: boolean;
      points: number;
      doubleBonus: number;
      finishTypePoints: number;
      penaltyWinnerPoints: number;
      predictedFinishType: string | null;
      predictedPenaltyWinnerTeamId: string | null;
    } | null;
    userScorerPredictions: {
      player: { name: string };
      predictedGoals: number;
      points: number;
    }[];
    userBoldScorerBet?: {
      points: number;
      player: { name: string };
    } | null;
    userOctopusBet?: {
      points: number;
      saves?: number | null;
      goalsConceded?: number | null;
      player: { name: string };
    } | null;
    octopusCount?: number;
    predictionsCount?: number;
    doublesCount?: number;
    boldCount?: number;
  };

  const canPredict = isPredictionAllowed(m.matchTime, m.status);
  const isFinished = m.status === "FINISHED";
  const isLive = m.status === "LIVE";
  const penaltyWinnerName =
    m.penaltyWinnerTeamId === m.homeTeam.id
      ? m.homeTeam.name
      : m.penaltyWinnerTeamId === m.awayTeam.id
        ? m.awayTeam.name
        : null;

  const breakdownInput =
    isFinished && m.homeScore != null && m.awayScore != null
      ? {
          homeScore: m.homeScore,
          awayScore: m.awayScore,
          isKnockout: m.isKnockout,
          actualFinishType: asFinishType(m.actualFinishType),
          penaltyWinnerTeamId: m.penaltyWinnerTeamId,
          homeTeamName: m.homeTeam.name,
          awayTeamName: m.awayTeam.name,
          penaltyWinnerName,
          userPrediction: m.userPrediction
            ? {
                ...m.userPrediction,
                predictedFinishType: asFinishType(
                  m.userPrediction.predictedFinishType
                ),
              }
            : null,
          userScorerPredictions: m.userScorerPredictions,
          userBoldScorerBet: m.userBoldScorerBet
            ? {
                points: m.userBoldScorerBet.points,
                player: { name: m.userBoldScorerBet.player.name },
              }
            : null,
          userOctopusBet: m.userOctopusBet
            ? {
                points: m.userOctopusBet.points,
                saves: m.userOctopusBet.saves ?? null,
                goalsConceded: m.userOctopusBet.goalsConceded ?? null,
                player: { name: m.userOctopusBet.player.name },
              }
            : null,
        }
      : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/matches" className="text-sm text-primary hover:underline">
        ← {t.matches.back}
      </Link>

      <section className="rounded-xl border border-card-border bg-card p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
          <span className="rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-xs font-bold text-warning">
            {t.worldCup}
          </span>
          <span>{m.round.name}</span>
          {m.isKnockout && (
            <span className="rounded bg-warning/20 px-2 py-0.5 text-warning">
              {t.matches.knockout}
            </span>
          )}
          <span>{t.status[m.status as keyof typeof t.status]}</span>
        </div>

        <div className="grid items-center gap-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-6 sm:py-6">
          <div className="flex flex-1 flex-col items-center gap-2">
            <div className="rounded-xl border border-card-border bg-background p-3">
              <TeamLogo {...m.homeTeam} size="lg" />
            </div>
            <span className="max-w-full truncate text-center text-lg font-black">
              {m.homeTeam.name}
            </span>
          </div>

          <div className="rounded-xl border border-card-border bg-background px-5 py-4 text-center">
            <div className="text-4xl font-black tabular-nums sm:text-5xl">
              {m.status === "FINISHED" || m.status === "LIVE"
                ? `${m.homeScore} - ${m.awayScore}`
                : "vs"}
            </div>
            <p className="mt-2 text-sm text-muted">
              {formatDate(m.matchTime, locale)}
            </p>
            {typeof m.predictionsCount === 'number' && (
              <div className="mt-4 grid w-full grid-cols-3 gap-3">
                <div className="rounded-lg border border-red-500/20 bg-red-950/5 p-4 text-center">
                  <div className="text-2xl font-bold text-primary">{m.boldCount ?? 0}</div>
                  <div className="mt-1 text-sm text-muted">{t.matches.featureBold}</div>
                </div>
                <div className="rounded-lg border border-amber-500/20 bg-amber-950/5 p-4 text-center">
                  <div className="text-2xl font-bold text-primary">{m.octopusCount ?? 0}</div>
                  <div className="mt-1 text-sm text-muted">{locale === 'ar' ? 'الأخطبوط' : 'Octopus'}</div>
                </div>
                <div className="rounded-lg border border-card-border bg-background p-4 text-center">
                  <div className="text-2xl font-bold text-primary">{m.predictionsCount ?? 0}</div>
                  <div className="mt-1 text-sm text-muted">{m.predictionsCount === 1 ? t.matches.predictorSingular : t.matches.predictorPlural}</div>
                </div>
              </div>
            )}
            {canPredict && m.status !== "LIVE" && (
              <div className="mt-3 flex justify-center">
                <PredictionCountdown matchTime={m.matchTime} />
              </div>
            )}
            {m.actualFinishType && (
              <p className="mt-1 text-xs text-muted">
                {t.finishType[m.actualFinishType as keyof typeof t.finishType]}
              </p>
            )}
          </div>

          <div className="flex flex-1 flex-col items-center gap-2">
            <div className="rounded-xl border border-card-border bg-background p-3">
              <TeamLogo {...m.awayTeam} size="lg" />
            </div>
            <span className="max-w-full truncate text-center text-lg font-black">
              {m.awayTeam.name}
            </span>
          </div>
        </div>

        {canPredict && (
          <div className="flex justify-center border-t border-card-border pt-4">
            <PredictNavLink matchId={m.id}>
              <Button>
                {m.userPrediction ? t.matches.editPrediction : t.matches.makePrediction}
              </Button>
            </PredictNavLink>
          </div>
        )}

        {!canPredict && (
          <div className="border-t border-card-border pt-4">
            <ViewLeaguePredictionsButton matchId={m.id} fullWidth />
          </div>
        )}
      </section>

      {breakdownInput && (
        <MatchPointsBreakdown
          {...breakdownInput}
          scorersOnly={isLive && !isFinished}
        />
      )}

      {m.userPrediction && !isFinished && (
        <Card>
          <CardHeader>
            <CardTitle>{t.matches.yourPrediction}</CardTitle>
          </CardHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted">{t.matches.score}</p>
              <div className="flex items-center gap-2">
                <p className="text-xl font-bold">
                  {m.userPrediction.predHome} - {m.userPrediction.predAway}
                </p>
                {m.userPrediction.isDouble && (
                  <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-warning/20 px-1.5 text-xs font-bold text-warning ring-1 ring-warning/30">
                    2×
                  </span>
                )}
              </div>
            </div>
            {m.userBoldScorerBet && (
              <div>
                <p className="text-sm text-muted">{t.matches.featureBold}</p>
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-6 items-center gap-0.5 rounded-md bg-amber-500/15 px-1.5 text-xs font-semibold text-amber-400 ring-1 ring-amber-500/25">
                    <span aria-hidden>✦</span>
                    <span>{m.userBoldScorerBet.player.name}</span>
                  </span>
                </div>
              </div>
            )}
            {m.userPrediction.predictedFinishType && (
              <div>
                <p className="text-sm text-muted">{t.matches.finishType}</p>
                <p className="font-medium">
                  {t.finishType[m.userPrediction.predictedFinishType as keyof typeof t.finishType]}
                </p>
              </div>
            )}
          </div>
        </Card>
      )}

      {m.userScorerPredictions &&
        m.userScorerPredictions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t.matches.scorers}</CardTitle>
          </CardHeader>
          <ul className="space-y-2">
            {m.userScorerPredictions.map((sp, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span>
                  {sp.player.name}
                  <span className="mr-2 text-muted"> (×{sp.predictedGoals ?? 1})</span>
                </span>
                {(isFinished || isLive) && (
                  <span className={sp.points > 0 ? "text-primary" : "text-muted"}>
                    {sp.points > 0 ? `+${sp.points}` : "0"}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {m.matchScorers && m.matchScorers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t.matches.goalScorers}</CardTitle>
          </CardHeader>
          <ul className="space-y-2">
            {m.matchScorers.map((s, i) => (
              <li key={i} className="flex justify-between">
                <span>{s.player.name}</span>
                <span className="text-muted">
                  {s.goals}{" "}
                  {s.goals === 1 ? t.matches.goals : t.matches.goalsPlural}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Link href="/leaderboard/overall" className="block">
        <Card className="cursor-pointer transition-colors hover:border-primary/50">
          <p className="text-sm text-muted">{t.matches.viewRoundLb}</p>
          <p className="font-semibold text-primary">{m.round.name} →</p>
        </Card>
      </Link>
    </div>
  );
}
