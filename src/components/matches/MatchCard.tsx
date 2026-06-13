"use client";

import Link from "next/link";
import { useEffect, useState, memo } from "react";
import { formatDate, isPredictionAllowed, getPredictionLockReason } from "@/lib/utils";
import { PredictionCountdown } from "@/components/matches/PredictionCountdown";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { Card } from "@/components/ui/Card";
import { PredictionFeatureTag } from "@/components/ui/PredictionFeatureTag";
import dynamic from "next/dynamic";
const MatchPointsBreakdown = dynamic(
  () => import("@/components/matches/MatchPointsBreakdown").then((m) => ({ default: m.MatchPointsBreakdown })),
  { loading: () => <div /> }
);
import { asFinishType } from "@/lib/finish-type";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { PredictNavLink } from "@/components/matches/PredictNavLink";
import { ViewLeaguePredictionsButton } from "@/components/matches/ViewLeaguePredictionsButton";
import { seedPredictMatchFromList } from "@/lib/predict-prefetch";

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
      doubleBonus?: number;
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
  isPastMatch?: boolean;
  /** بطاقة توقعاتك النهائية — نفس شكل التوقع مع زر توقعات الدوري */
  finalPrediction?: boolean;
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

export function MatchCard({
  match,
  showPredictButton,
  isPastMatch = false,
  finalPrediction = false,
}: MatchCardProps) {
  const { messages: t, locale } = useI18n();
  const [canPredict, setCanPredict] = useState(false);
  const [lockReason, setLockReason] = useState<string | null>(null);
  const isFinished = match.status === "FINISHED";
  const isLive = match.status === "LIVE";
  const hasPrediction = !!match.userPrediction;
  const hasMatchPoints =
    hasPrediction ||
    (match.userScorerPredictions?.length ?? 0) > 0 ||
    !!match.userBoldScorerBet;
  const stageLabel =
    (match.stageName &&
      t.stageLabels[match.stageName as keyof typeof t.stageLabels]) ||
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

  const showPredictionInfo = hasPrediction && match.userPrediction;
  const showUserPrediction = showPredictionInfo && !isFinished;

  useEffect(() => {
    setCanPredict(isPredictionAllowed(match.matchTime, match.status));
    setLockReason(getPredictionLockReason(match.matchTime, match.status, t));
  }, [match.matchTime, match.status, t]);

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
  }, [showPredictButton, canPredict, match]);

  return (
    <Card
      className={`transition-colors ${
        match.userBoldScorerBet
          ? "border-red-400/70 bg-gradient-to-br from-red-950/75 via-red-900/30 to-rose-500/10 shadow-xl shadow-red-950/30 ring-1 ring-inset ring-red-300/15 hover:border-red-300"
          : match.userPrediction?.isDouble
            ? "border-orange-300/70 bg-gradient-to-br from-orange-950/75 via-orange-900/30 to-amber-400/10 shadow-xl shadow-orange-950/30 ring-1 ring-inset ring-orange-200/15 hover:border-orange-200"
            : "hover:border-primary/30"
      }`}
    >
      <div className="mb-3 flex items-center justify-between text-xs text-muted">
        <span>{stageLabel}</span>
        <div className="flex items-center gap-2">
          {match.isKnockout && (
            <span className="rounded bg-warning/20 px-2 py-0.5 text-warning">
              {t.matches.knockoutBadge}
            </span>
          )}
          {hasPrediction && !isFinished && (
            <span className="rounded bg-warning/15 px-2 py-0.5 text-warning">
              {t.matches.yourPrediction}
            </span>
          )}
          {!canPredict && !isFinished && !isLive && (
            <span className="rounded bg-card-border px-2 py-0.5">{t.matches.locked}</span>
          )}
          {isLive && (
            <span className="rounded bg-primary/20 px-2 py-0.5 font-semibold text-primary animate-pulse">
              {t.status.LIVE}
            </span>
          )}
          {!isLive && (
            <span>
              {t.status[match.status as keyof typeof t.status] ?? match.status}
            </span>
          )}
        </div>
      </div>

      <Link href={`/matches/${match.id}`} prefetch={false} className="block">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <TeamLogo {...match.homeTeam} />
            <span className="truncate font-medium">{match.homeTeam.shortName}</span>
          </div>

          <div className="flex shrink-0 flex-col items-center px-1">
            {isLive ? (
              <div className="text-center">
                <span className="text-2xl font-bold">
                  {match.homeScore ?? 0} - {match.awayScore ?? 0}
                </span>
                {showUserPrediction && (
                  <p className="mt-1 text-xs font-semibold text-warning">
                    {t.matches.yourPredictionShort}: {match.userPrediction!.predHome}-
                    {match.userPrediction!.predAway}
                  </p>
                )}
              </div>
            ) : isFinished && finalPrediction && showPredictionInfo ? (
              <div className="text-center">
                <span className="text-2xl font-bold">
                  {match.homeScore} - {match.awayScore}
                </span>
                <p className="mt-1 text-xs font-semibold text-warning">
                  {t.matches.yourPredictionShort}: {match.userPrediction!.predHome}-
                  {match.userPrediction!.predAway}
                </p>
              </div>
            ) : isFinished ? (
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
              <span className="text-lg font-medium text-muted">{t.matches.vs}</span>
            )}
            {match.userPrediction?.isDouble && showPredictionInfo && (
              <PredictionFeatureTag
                type="double"
                icon="2×"
                label={t.matches.featureDouble}
                className="mt-1"
              />
            )}

            {match.userBoldScorerBet && !isFinished && (
              <PredictionFeatureTag
                type="bold"
                icon="✦"
                label={t.matches.featureBold}
                className="mt-1"
              />
            )}
            <span className="mt-1 text-xs text-muted">
              {formatDate(match.matchTime, locale)}
            </span>
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            <span className="truncate font-medium">{match.awayTeam.shortName}</span>
            <TeamLogo {...match.awayTeam} />
          </div>
        </div>
      </Link>

      {showPredictButton && !isFinished && !isLive && !isPastMatch && (
        <div className="mt-3">
          <PredictionCountdown matchTime={match.matchTime} />
        </div>
      )}

      {showPredictButton && canPredict && !isPastMatch && (
        <div className="mt-4 flex justify-end">
          <PredictNavLink
            matchId={match.id}
            className={
              hasPrediction
                ? "rounded-lg border border-warning/50 bg-warning/15 px-4 py-2 text-sm font-medium text-warning hover:bg-warning/25"
                : "rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
            }
          >
            {hasPrediction ? t.matches.editPrediction : t.matches.predict}
          </PredictNavLink>
        </div>
      )}

      {finalPrediction && !canPredict && hasPrediction && !isFinished && (
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <Link
            href={`/matches/${match.id}/predictions`}
            onClick={(e) => e.stopPropagation()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
          >
            {t.matches.viewLeaguePredictionsShort}
          </Link>
          <Link
            href={`/matches/${match.id}`}
            onClick={(e) => e.stopPropagation()}
            className="rounded-lg border border-card-border px-4 py-2 text-sm font-medium text-muted hover:text-foreground"
          >
            {t.matches.viewYourPrediction}
          </Link>
        </div>
      )}

      {finalPrediction && isFinished && hasPrediction && (
        <div className="mt-4 flex justify-end">
          <Link
            href={`/matches/${match.id}/predictions`}
            onClick={(e) => e.stopPropagation()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
          >
            {t.matches.viewLeaguePredictionsShort}
          </Link>
        </div>
      )}

      {showPredictButton && !finalPrediction && lockReason && !isFinished && !canPredict && (
        <p className="mt-2 text-xs text-muted">{lockReason}</p>
      )}

      {!finalPrediction && !canPredict && hasPrediction && !isFinished && (
        <div className="mt-3 text-center">
          <Link
            href={`/matches/${match.id}`}
            className="text-xs font-medium text-warning hover:underline"
          >
            {t.matches.viewYourPrediction} →
          </Link>
        </div>
      )}

      {!finalPrediction && !canPredict && (
        <div className="mt-4" onClick={(e) => e.stopPropagation()}>
          <ViewLeaguePredictionsButton matchId={match.id} fullWidth />
        </div>
      )}

      {(isFinished || isLive) &&
        hasMatchPoints &&
        (isLive ||
          (match.homeScore != null && match.awayScore != null)) && (
          <div className="mt-3">
            <MatchPointsBreakdown
              compact
              defaultOpen={isLive}
              scorersOnly={isLive && !isFinished}
              homeScore={match.homeScore ?? 0}
              awayScore={match.awayScore ?? 0}
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
                      doubleBonus: match.userPrediction.doubleBonus ?? 0,
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

export default memo(MatchCard);
