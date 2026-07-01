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
import { LeaguePredictionsNavLink } from "@/components/matches/LeaguePredictionsNavLink";
import {
  seedPredictMatchFromList,
} from "@/lib/predict-prefetch";
import { prefetchMatchDetail } from "@/lib/match-detail-cache";
import { getSaudiLossDisplayTeam } from "@/lib/saudi-kuwait-joke";
import {
  getOctopusCleanSheetBonus,
  getOctopusConcededCapLabel,
  getOctopusConcededCapPoints,
  getOctopusSaveTierPoints,
} from "@/lib/octopus-points";

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
    userOctopusBet?: {
      points: number;
      saves?: number | null;
      goalsConceded?: number | null;
      player: { name: string };
    } | null;
    missingPredictionUsernames?: string[];
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

function octopusSummary(
  bet: NonNullable<MatchCardProps["match"]["userOctopusBet"]>,
  locale: string
) {
  const saves = bet.saves ?? null;
  const goalsConceded = bet.goalsConceded ?? null;
  const saveTierPoints = getOctopusSaveTierPoints(saves);
  const cleanSheetBonus = getOctopusCleanSheetBonus(goalsConceded);
  const concededCap = getOctopusConcededCapPoints(goalsConceded);
  const cappedByGoals = Number.isFinite(concededCap) && saveTierPoints > concededCap;
  const isAr = locale === "ar";
  const savesText =
    saves == null
      ? isAr ? "التصديات غير متاحة" : "saves unavailable"
      : isAr ? `${saves} تصديات` : `${saves} saves`;
  const pointsText = isAr ? `+${bet.points} نقطة` : `+${bet.points} pts`;
  const detail = [
    bet.player.name,
    savesText,
    isAr
      ? `نقاط التصديات قبل السقف +${saveTierPoints}`
      : `save tier before cap +${saveTierPoints}`,
    cleanSheetBonus > 0
      ? isAr ? `كلين شيت +${cleanSheetBonus}` : `clean sheet +${cleanSheetBonus}`
      : null,
    goalsConceded != null
      ? isAr ? `استقبل ${goalsConceded}` : `conceded ${goalsConceded}`
      : null,
    getOctopusConcededCapLabel(goalsConceded),
    cappedByGoals
      ? isAr ? "سقف الأهداف خفض نقاط التصديات" : "goals-conceded cap reduced save points"
      : null,
    pointsText,
  ].filter(Boolean).join(" • ");

  return {
    label: `${isAr ? "الأخطبوط" : "Octopus"} ${pointsText} • ${savesText}`,
    title: detail,
  };
}

function finishBadgeClass(type: string | null | undefined) {
  if (type === "PENALTIES") {
    return "border-fuchsia-300/40 bg-fuchsia-500/15 text-fuchsia-100";
  }
  if (type === "EXTRA_TIME") {
    return "border-sky-300/40 bg-sky-500/15 text-sky-100";
  }
  return "border-emerald-300/35 bg-emerald-500/15 text-emerald-100";
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
  const [missingPopupOpen, setMissingPopupOpen] = useState(false);
  const isFinished = match.status === "FINISHED";
  const isLive = match.status === "LIVE";
  const missingPredictionUsernames = match.missingPredictionUsernames;
  const showMissingPredictionButton =
    Array.isArray(missingPredictionUsernames) && !isFinished && !isLive;
  const hasPrediction = !!match.userPrediction;
  const actualFinishType = asFinishType(match.actualFinishType);
  const predictedFinishType = asFinishType(
    match.userPrediction?.predictedFinishType
  );
  const visibleFinishType = isFinished ? actualFinishType : predictedFinishType;
  const visibleFinishLabel =
    match.isKnockout && visibleFinishType
      ? t.finishType[visibleFinishType]
      : null;
  const accentClass = match.userBoldScorerBet
    ? "bg-gradient-to-r from-red-400 via-rose-300 to-orange-300"
    : match.userOctopusBet
      ? "bg-gradient-to-r from-cyan-300 via-sky-300 to-emerald-300"
      : match.userPrediction?.isDouble
        ? "bg-gradient-to-r from-orange-300 via-amber-200 to-yellow-300"
        : isLive
          ? "bg-gradient-to-r from-primary via-cyan-300 to-primary"
          : isFinished
            ? "bg-gradient-to-r from-emerald-300 via-card-border to-primary/70"
            : "bg-gradient-to-r from-card-border via-primary/50 to-card-border";
  const hasAnyUserEntry =
    hasPrediction ||
    (match.userScorerPredictions?.length ?? 0) > 0 ||
    !!match.userBoldScorerBet ||
    !!match.userOctopusBet;
  const hasMatchPoints =
    hasAnyUserEntry;
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

  // Ensure we always have sensible fallbacks for display values
  const safeHome = {
    name: (homeTeamDisplay.name || homeTeamDisplay.shortName || "").trim() || stageLabel,
    shortName: (homeTeamDisplay.shortName || homeTeamDisplay.name || "").trim() || "—",
    logoUrl: homeTeamDisplay.logoUrl,
  };
  const safeAway = {
    name: (awayTeamDisplay.name || awayTeamDisplay.shortName || "").trim() || stageLabel,
    shortName: (awayTeamDisplay.shortName || awayTeamDisplay.name || "").trim() || "—",
    logoUrl: awayTeamDisplay.logoUrl,
  };

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
      className={`relative overflow-hidden transition-colors ${
        match.userBoldScorerBet
          ? "border-red-400/60 bg-red-950/25 hover:border-red-300"
          : match.userOctopusBet
            ? "border-cyan-300/60 bg-cyan-950/25 hover:border-cyan-200"
          : match.userPrediction?.isDouble
            ? "border-orange-300/60 bg-orange-950/25 hover:border-orange-200"
            : "hover:border-primary/30"
      }`}
    >
      <div className={`absolute inset-x-0 top-0 h-1 ${accentClass}`} />
      <div className="mb-3 flex items-center justify-between text-xs text-muted">
        <span>{stageLabel}</span>
        <div className="flex items-center gap-2">
          {match.isKnockout && (
            <span className="rounded bg-warning/20 px-2 py-0.5 text-warning">
              {t.matches.knockoutBadge}
            </span>
          )}
          {visibleFinishLabel && (
            <span
              className={`rounded-md border px-2 py-0.5 font-semibold ${finishBadgeClass(
                visibleFinishType
              )}`}
            >
              {visibleFinishLabel}
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

      <Link
        href={`/matches/${match.id}`}
        prefetch={false}
        className="block"
        onMouseEnter={() => void prefetchMatchDetail(match.id, true)}
        onFocus={() => void prefetchMatchDetail(match.id, true)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <TeamLogo {...safeHome} />
            <span className="truncate font-medium">{safeHome.shortName}</span>
          </div>

          <div
            className={`flex min-w-[5.75rem] shrink-0 flex-col items-center rounded-xl border px-3 py-2 shadow-inner ${
              isLive
                ? "border-primary/35 bg-primary/10"
                : isFinished
                  ? "border-card-border/80 bg-background/60"
                  : showUserPrediction
                    ? "border-warning/30 bg-warning/10"
                    : "border-card-border/60 bg-background/35"
            }`}
          >
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
            {false && (
              <PredictionFeatureTag
                type="octopus"
                icon="GK"
                label={locale === "ar" ? "الأخطبوط" : "Octopus"}
                className="mt-1"
              />
            )}
            {match.userOctopusBet && showPredictionInfo && (() => {
              const summary = octopusSummary(match.userOctopusBet!, locale);
              return (
                <PredictionFeatureTag
                  type="octopus"
                  icon="GK"
                  label={summary.label}
                  title={summary.title}
                  className="mt-1 max-w-full"
                />
              );
            })()}
            <span className="mt-1 text-xs text-muted">
              {formatDate(match.matchTime, locale)}
            </span>
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            <span className="truncate font-medium">{safeAway.shortName}</span>
            <TeamLogo {...safeAway} />
          </div>
        </div>
      </Link>

      {showPredictButton && !isFinished && !isLive && !isPastMatch && (
        <div className="mt-3">
          <PredictionCountdown matchTime={match.matchTime} />
        </div>
      )}

      {showMissingPredictionButton && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setMissingPopupOpen(true)}
            className="w-full rounded-lg border border-amber-300/45 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-100 transition hover:border-amber-200/70 hover:bg-amber-500/15"
          >
            {locale === "ar"
              ? `شف اللي ما توقعوا (${missingPredictionUsernames.length})`
              : `Missing predictions (${missingPredictionUsernames.length})`}
          </button>
        </div>
      )}

      {showMissingPredictionButton && missingPopupOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          onClick={() => setMissingPopupOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-sm rounded-lg border border-card-border bg-card p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              aria-label={locale === "ar" ? "إغلاق" : "Close"}
              onClick={() => setMissingPopupOpen(false)}
              className="absolute end-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-card-border text-sm font-bold text-muted transition hover:border-primary/50 hover:text-foreground"
            >
              x
            </button>
            <h3 className="pe-9 text-lg font-bold">
              {locale === "ar" ? "اللي ما توقعوا" : "Missing predictions"}
            </h3>
            {missingPredictionUsernames.length > 0 ? (
              <ul className="mt-4 max-h-72 space-y-2 overflow-y-auto pe-1">
                {missingPredictionUsernames.map((username) => (
                  <li
                    key={username}
                    className="rounded-md border border-card-border bg-background/60 px-3 py-2 text-sm font-semibold"
                  >
                    {username}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 rounded-md border border-emerald-300/35 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                {locale === "ar"
                  ? "كل المستخدمين توقعوا"
                  : "Everyone has predicted"}
              </p>
            )}
          </div>
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
          <LeaguePredictionsNavLink
            matchId={match.id}
            onClick={(e) => e.stopPropagation()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
          >
            {t.matches.viewLeaguePredictionsShort}
          </LeaguePredictionsNavLink>
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
          <LeaguePredictionsNavLink
            matchId={match.id}
            onClick={(e) => e.stopPropagation()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
          >
            {t.matches.viewLeaguePredictionsShort}
          </LeaguePredictionsNavLink>
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

      {/* حالة المباراة المقفلة بدون توقع */}
      {isPastMatch && isFinished && !hasAnyUserEntry && (
        <div className="mt-3 rounded-lg border border-red-500/50 bg-red-500/10 p-3">
          <p className="text-sm font-semibold text-red-500">
            🔴 {t.matches.notPredicted}
          </p>
          <p className="mt-1 text-xs text-red-500/80">
            {t.matches.notPredictedReason}
          </p>
          <p className="mt-2 text-xs text-muted">{t.matches.noPointsForUnpredicted}</p>
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
              homeTeamName={homeTeamDisplay.name}
              awayTeamName={awayTeamDisplay.name}
              penaltyWinnerName={
                match.penaltyWinnerTeamId === match.homeTeam.id
                  ? homeTeamDisplay.name
                  : match.penaltyWinnerTeamId === match.awayTeam.id
                    ? awayTeamDisplay.name
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
              userOctopusBet={
                match.userOctopusBet
                  ? {
                      points: match.userOctopusBet.points,
                      saves: match.userOctopusBet.saves ?? null,
                      goalsConceded: match.userOctopusBet.goalsConceded ?? null,
                      player: { name: match.userOctopusBet.player.name },
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
