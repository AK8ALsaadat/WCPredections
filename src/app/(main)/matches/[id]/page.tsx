"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { LoadingPage } from "@/components/ui/LoadingSpinner";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Button } from "@/components/ui/Button";
import { PredictionCountdown } from "@/components/matches/PredictionCountdown";
import { PredictNavLink } from "@/components/matches/PredictNavLink";
import { MatchPointsBreakdown } from "@/components/matches/MatchPointsBreakdown";
import { asFinishType } from "@/lib/finish-type";
import { formatDate, isPredictionAllowed } from "@/lib/utils";
import { ar } from "@/lib/i18n/ar";
import { FINISH_TYPE_LABELS, MATCH_STATUS_LABELS } from "@/types";

export default function MatchDetailPage() {
  const params = useParams();
  const matchId = params.id as string;
  const [match, setMatch] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/matches/${matchId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setMatch(data.data);
        } else {
          setError(data.error);
        }
      })
      .catch(() => setError(ar.errors.loadFailed))
      .finally(() => setLoading(false));
  }, [matchId]);

  if (loading) return <LoadingPage />;
  if (error || !match) return <ErrorMessage message={error || ar.matches.notFound} />;

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
  };

  const canPredict = isPredictionAllowed(m.matchTime);
  const isFinished = m.status === "FINISHED";
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
        }
      : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/matches" className="text-sm text-primary hover:underline">
        ← {ar.matches.back}
      </Link>

      <Card>
        <div className="mb-2 flex items-center gap-2 text-sm text-muted">
          <span>{m.round.name}</span>
          {m.isKnockout && (
            <span className="rounded bg-warning/20 px-2 py-0.5 text-warning">
              {ar.matches.knockout}
            </span>
          )}
          <span>{MATCH_STATUS_LABELS[m.status as keyof typeof MATCH_STATUS_LABELS]}</span>
        </div>

        <div className="flex items-center justify-between gap-6 py-6">
          <div className="flex flex-1 flex-col items-center gap-2">
            <TeamLogo {...m.homeTeam} size="lg" />
            <span className="font-semibold">{m.homeTeam.name}</span>
          </div>

          <div className="text-center">
            <div className="text-4xl font-bold">
              {m.status === "FINISHED" || m.status === "LIVE"
                ? `${m.homeScore} - ${m.awayScore}`
                : "vs"}
            </div>
            <p className="mt-2 text-sm text-muted">{formatDate(m.matchTime)}</p>
            {canPredict && m.status !== "LIVE" && (
              <div className="mt-3 flex justify-center">
                <PredictionCountdown matchTime={m.matchTime} />
              </div>
            )}
            {m.actualFinishType && (
              <p className="mt-1 text-xs text-muted">
                {FINISH_TYPE_LABELS[m.actualFinishType as keyof typeof FINISH_TYPE_LABELS]}
              </p>
            )}
          </div>

          <div className="flex flex-1 flex-col items-center gap-2">
            <TeamLogo {...m.awayTeam} size="lg" />
            <span className="font-semibold">{m.awayTeam.name}</span>
          </div>
        </div>

        {canPredict && (
          <div className="flex justify-center border-t border-card-border pt-4">
            <PredictNavLink matchId={m.id}>
              <Button>
                {m.userPrediction ? ar.matches.editPrediction : ar.matches.makePrediction}
              </Button>
            </PredictNavLink>
          </div>
        )}
      </Card>

      {breakdownInput && (
        <MatchPointsBreakdown {...breakdownInput} />
      )}

      {m.userPrediction && !isFinished && (
        <Card>
          <CardHeader>
            <CardTitle>{ar.matches.yourPrediction}</CardTitle>
          </CardHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted">{ar.matches.score}</p>
              <p className="text-xl font-bold">
                {m.userPrediction.predHome} - {m.userPrediction.predAway}
                {m.userPrediction.isDouble && (
                  <span className="ml-2 text-sm text-warning">2x</span>
                )}
              </p>
            </div>
            {m.userPrediction.predictedFinishType && (
              <div>
                <p className="text-sm text-muted">{ar.matches.finishType}</p>
                <p className="font-medium">
                  {FINISH_TYPE_LABELS[m.userPrediction.predictedFinishType as keyof typeof FINISH_TYPE_LABELS]}
                </p>
              </div>
            )}
          </div>
        </Card>
      )}

      {isFinished && m.userScorerPredictions && m.userScorerPredictions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{ar.matches.scorers}</CardTitle>
          </CardHeader>
          <ul className="space-y-2">
            {m.userScorerPredictions.map((sp, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span>
                  {sp.player.name}
                  <span className="mr-2 text-muted"> (×{sp.predictedGoals ?? 1})</span>
                </span>
                <span className={sp.points > 0 ? "text-primary" : "text-muted"}>
                  {sp.points > 0 ? `+${sp.points}` : "0"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {m.matchScorers && m.matchScorers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{ar.matches.goalScorers}</CardTitle>
          </CardHeader>
          <ul className="space-y-2">
            {m.matchScorers.map((s, i) => (
              <li key={i} className="flex justify-between">
                <span>{s.player.name}</span>
                <span className="text-muted">
                  {s.goals}{" "}
                  {s.goals === 1 ? ar.matches.goals : ar.matches.goalsPlural}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Link href={`/leaderboard/round/${m.round.id}`} className="block">
        <Card className="cursor-pointer transition-colors hover:border-primary/50">
          <p className="text-sm text-muted">{ar.matches.viewRoundLb}</p>
          <p className="font-semibold text-primary">{m.round.name} →</p>
        </Card>
      </Link>
    </div>
  );
}
