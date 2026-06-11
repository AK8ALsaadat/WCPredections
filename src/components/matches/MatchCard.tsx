"use client";

import Link from "next/link";
import { useEffect } from "react";
import { formatDate, isPredictionAllowed, getPredictionLockReason } from "@/lib/utils";
import { PredictionCountdown } from "@/components/matches/PredictionCountdown";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { Card } from "@/components/ui/Card";
import { MatchPointsBreakdown } from "@/components/matches/MatchPointsBreakdown";
import { asFinishType } from "@/lib/finish-type";
import { MATCH_STATUS_LABELS } from "@/types";
import { ar } from "@/lib/i18n/ar";
import { PredictNavLink } from "@/components/matches/PredictNavLink";
import {
  prefetchPredictData,
  seedPredictMatchFromList,
} from "@/lib/predict-prefetch";

type ScorerPick = {
  predictedGoals: number;
  points?: number;
  player: { id: string; name: string; teamId: string };
};

type MatchCardProps = {
  match: {
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
    userScorerPredictions?: ScorerPick[];
    userBoldScorerBet?: {
      points: number;
      player: { name: string };
    } | null;
  };
  showPredictButton?: boolean;
};

function shortPlayerName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : name;
}

function ScorerList({ scorers }: { scorers: ScorerPick[] }) {
  if (scorers.length === 0) return null;

  return (
    <ul className="mt-1 max-w-[5.5rem] space-y-0.5 text-center">
      {scorers.map((pick) => (
        <li
          key={pick.player.id}
          className="truncate text-[10px] leading-tight text-primary/90"
          title={pick.player.name}
        >
          {shortPlayerName(pick.player.name)}
          {pick.predictedGoals > 1 && (
            <span className="text-warning"> ×{pick.predictedGoals}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function MatchCard({ match, showPredictButton }: MatchCardProps) {
  const canPredict = isPredictionAllowed(match.matchTime);
  const lockReason = getPredictionLockReason(match.matchTime);
  const isFinished = match.status === "FINISHED";
  const isLive = match.status === "LIVE";
  const hasPrediction = !!match.userPrediction;
  const hasMatchPoints =
    hasPrediction ||
    (match.userScorerPredictions?.length ?? 0) > 0 ||
    !!match.userBoldScorerBet;
  const stageLabel =
    (match.stageName &&
      ar.stageLabels[match.stageName as keyof typeof ar.stageLabels]) ||
    match.stageName ||
    match.round.name;

  const homeScorers =
    match.userScorerPredictions?.filter(
      (p) => p.player.teamId === match.homeTeam.id
    ) ?? [];
  const awayScorers =
    match.userScorerPredictions?.filter(
      (p) => p.player.teamId === match.awayTeam.id
    ) ?? [];

  const showUserPrediction =
    hasPrediction && !isFinished && !isLive && match.userPrediction;

  useEffect(() => {
    if (!showPredictButton || !canPredict) return;

    seedPredictMatchFromList({
      id: match.id,
      matchTime: match.matchTime,
      isKnockout: match.isKnockout,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      userPrediction: match.userPrediction
        ? {
            predHome: match.userPrediction.predHome,
            predAway: match.userPrediction.predAway,
            isDouble: match.userPrediction.isDouble,
            predictedFinishType: match.userPrediction.predictedFinishType,
            predictedPenaltyWinnerTeamId:
              match.userPrediction.predictedPenaltyWinnerTeamId,
          }
        : null,
      userScorerPredictions: match.userScorerPredictions?.map((sp) => ({
        playerId: sp.player.id,
        predictedGoals: sp.predictedGoals,
      })),
    });
    prefetchPredictData(match.id);
  }, [showPredictButton, canPredict, match]);

  return (
    <Card className="transition-colors hover:border-primary/30">
      <div className="mb-3 flex items-center justify-between text-xs text-muted">
        <span>{stageLabel}</span>
        <div className="flex items-center gap-2">
          {match.isKnockout && (
            <span className="rounded bg-warning/20 px-2 py-0.5 text-warning">إقصائي</span>
          )}
          {hasPrediction && !isFinished && (
            <span className="rounded bg-warning/15 px-2 py-0.5 text-warning">
              {ar.matches.yourPrediction}
            </span>
          )}
          {!canPredict && !isFinished && !isLive && (
            <span className="rounded bg-card-border px-2 py-0.5">{ar.matches.locked}</span>
          )}
          <span className={isLive ? "font-semibold text-primary" : ""}>
            {MATCH_STATUS_LABELS[match.status as keyof typeof MATCH_STATUS_LABELS] ?? match.status}
          </span>
        </div>
      </div>

      <Link href={`/matches/${match.id}`} prefetch className="block">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <TeamLogo {...match.homeTeam} />
            <span className="truncate font-medium">{match.homeTeam.shortName}</span>
          </div>

          <div className="flex shrink-0 flex-col items-center px-1">
            {isFinished || isLive ? (
              <span className="text-2xl font-bold">
                {match.homeScore} - {match.awayScore}
              </span>
            ) : showUserPrediction ? (
              <div className="flex items-start gap-2">
                <div className="flex flex-col items-center">
                  <span className="text-2xl font-bold text-warning">
                    {match.userPrediction!.predHome}
                  </span>
                  <ScorerList scorers={homeScorers} />
                </div>
                <span className="pt-1 text-xl font-bold text-muted">-</span>
                <div className="flex flex-col items-center">
                  <span className="text-2xl font-bold text-warning">
                    {match.userPrediction!.predAway}
                  </span>
                  <ScorerList scorers={awayScorers} />
                </div>
              </div>
            ) : (
              <span className="text-lg font-medium text-muted">{ar.matches.vs}</span>
            )}
            {match.userPrediction?.isDouble && showUserPrediction && (
              <span className="mt-0.5 text-[10px] font-semibold text-warning">2x</span>
            )}
            <span className="mt-1 text-xs text-muted">{formatDate(match.matchTime)}</span>
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            <span className="truncate font-medium">{match.awayTeam.shortName}</span>
            <TeamLogo {...match.awayTeam} />
          </div>
        </div>
      </Link>

      {showPredictButton && !isFinished && !isLive && (
        <div className="mt-3">
          <PredictionCountdown matchTime={match.matchTime} />
        </div>
      )}

      {showPredictButton && canPredict && (
        <div className="mt-4 flex justify-end">
          <PredictNavLink
            matchId={match.id}
            className={
              hasPrediction
                ? "rounded-lg border border-warning/50 bg-warning/15 px-4 py-2 text-sm font-medium text-warning hover:bg-warning/25"
                : "rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
            }
          >
            {hasPrediction ? ar.matches.editPrediction : ar.matches.predict}
          </PredictNavLink>
        </div>
      )}

      {showPredictButton && lockReason && !isFinished && !canPredict && (
        <p className="mt-2 text-xs text-muted">{lockReason}</p>
      )}

      {isFinished &&
        hasMatchPoints &&
        match.homeScore != null &&
        match.awayScore != null && (
          <div className="mt-3">
            <MatchPointsBreakdown
              compact
              homeScore={match.homeScore}
              awayScore={match.awayScore}
              isKnockout={match.isKnockout}
              actualFinishType={asFinishType(match.actualFinishType)}
              penaltyWinnerTeamId={match.penaltyWinnerTeamId}
              homeTeamName={match.homeTeam.name}
              awayTeamName={match.awayTeam.name}
              penaltyWinnerName={
                match.penaltyWinnerTeamId === match.homeTeam.id
                  ? match.homeTeam.name
                  : match.penaltyWinnerTeamId === match.awayTeam.id
                    ? match.awayTeam.name
                    : null
              }
              userPrediction={
                match.userPrediction
                  ? {
                      predHome: match.userPrediction.predHome,
                      predAway: match.userPrediction.predAway,
                      isDouble: match.userPrediction.isDouble,
                      points: match.userPrediction.points ?? 0,
                      finishTypePoints:
                        match.userPrediction.finishTypePoints ?? 0,
                      penaltyWinnerPoints:
                        match.userPrediction.penaltyWinnerPoints ?? 0,
                      predictedFinishType: asFinishType(
                        match.userPrediction.predictedFinishType
                      ),
                      predictedPenaltyWinnerTeamId:
                        match.userPrediction.predictedPenaltyWinnerTeamId,
                    }
                  : null
              }
              userScorerPredictions={match.userScorerPredictions?.map((sp) => ({
                predictedGoals: sp.predictedGoals,
                points: sp.points ?? 0,
                player: { name: sp.player.name },
              }))}
              userBoldScorerBet={
                match.userBoldScorerBet
                  ? {
                      points: match.userBoldScorerBet.points,
                      player: { name: match.userBoldScorerBet.player.name },
                    }
                  : null
              }
            />
          </div>
        )}
    </Card>
  );
}
