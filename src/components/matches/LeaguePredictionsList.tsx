"use client";

import { useState } from "react";
import type { LeagueMatchPredictionRow } from "@/types";
import { asFinishType } from "@/lib/finish-type";
import {
  buildLeaguePendingBreakdown,
  buildMatchPointsBreakdown,
  leagueRowToBreakdownInput,
  type LeagueMatchResultContext,
} from "@/lib/match-points-breakdown";
import { PointsBreakdownLines } from "@/components/matches/PointsBreakdownLines";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { PredictionFeatureTag } from "@/components/ui/PredictionFeatureTag";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { Messages } from "@/lib/i18n/ar";

type LeagueTeamInfo = {
  name: string;
  shortName: string;
  logoUrl?: string | null;
};

type LeaguePredictionsListProps = {
  rows: LeagueMatchPredictionRow[];
  homeTeamId: string;
  awayTeamId: string;
  homeTeam: LeagueTeamInfo;
  awayTeam: LeagueTeamInfo;
  homeShortName: string;
  awayShortName: string;
  isKnockout: boolean;
  isFinished: boolean;
  matchStatus: string;
  matchResult?: LeagueMatchResultContext | null;
  currentUserId?: string;
};

function shortPlayerName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : name;
}

function FeatureBadges({
  row,
  isKnockout,
  t,
}: {
  row: LeagueMatchPredictionRow;
  isKnockout: boolean;
  t: Messages;
}) {
  const finishType = asFinishType(row.prediction?.predictedFinishType);
  const hasPenalty = Boolean(row.prediction?.predictedPenaltyWinnerTeamId);
  const hasBold = Boolean(row.boldScorerBet);
  const hasDouble = Boolean(row.prediction?.isDouble);

  if (!hasDouble && !hasBold && !(isKnockout && (finishType || hasPenalty))) {
    return null;
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1">
      {hasDouble && (
        <PredictionFeatureTag
          type="double"
          icon="2×"
          label={t.matches.featureDouble}
        />
      )}
      {hasBold && (
        <PredictionFeatureTag
          type="bold"
          icon="✦"
          title={`${t.matches.featureBold}: ${row.boldScorerBet!.player.name}`}
          label={shortPlayerName(row.boldScorerBet!.player.name)}
          className="max-w-[5.5rem]"
        />
      )}
      {isKnockout && finishType && (
        <span
          title={t.finishType[finishType]}
          className="inline-flex h-6 items-center rounded-md bg-accent/15 px-1.5 text-[10px] font-medium text-accent ring-1 ring-accent/25"
        >
          {finishType === "NINETY_MINUTES"
            ? "90′"
            : finishType === "EXTRA_TIME"
              ? "ET"
              : "PK"}
        </span>
      )}
      {isKnockout && hasPenalty && (
        <span
          title={t.matches.penaltyWinner}
          className="inline-flex h-6 items-center rounded-md bg-card-border/80 px-1.5 text-[10px] font-medium text-foreground/80"
        >
          🎯
        </span>
      )}
    </div>
  );
}

function PredictionScoreboard({
  homeTeam,
  awayTeam,
  predHome,
  predAway,
  homeScorers,
  awayScorers,
  allScorers,
  homeTeamId,
  awayTeamId,
  scorePoints,
  showResults,
  showMisses,
}: {
  homeTeam: LeagueTeamInfo;
  awayTeam: LeagueTeamInfo;
  predHome?: number;
  predAway?: number;
  homeScorers: LeagueMatchPredictionRow["scorerPredictions"];
  awayScorers: LeagueMatchPredictionRow["scorerPredictions"];
  allScorers: LeagueMatchPredictionRow["scorerPredictions"];
  homeTeamId: string;
  awayTeamId: string;
  scorePoints?: number | null;
  showResults: boolean;
  showMisses: boolean;
}) {
  const hasScore = predHome != null && predAway != null;

  return (
    <div
      className="flex w-full min-w-0 flex-col items-center gap-1.5 md:max-w-xs md:justify-self-center"
      dir="ltr"
    >
      {hasScore ? (
        <div className="flex items-baseline gap-1.5 tabular-nums tracking-tight">
          <span className="text-2xl font-bold leading-none">{predHome}</span>
          <span className="text-sm font-light text-muted">-</span>
          <span className="text-2xl font-bold leading-none">{predAway}</span>
        </div>
      ) : (
        <span className="text-lg text-muted">—</span>
      )}

      {showResults && scorePoints != null && (
        <span
          className={`text-[10px] font-bold ${
            scorePoints > 0 ? "text-primary" : "text-danger"
          }`}
        >
          {scorePoints > 0 ? `✓ +${scorePoints}` : "✗ 0"}
        </span>
      )}

      {(homeScorers.length > 0 || awayScorers.length > 0 || allScorers.length > 0) && (
        (homeScorers.length > 0 || awayScorers.length > 0) ? (
          <div className="grid w-full grid-cols-2 gap-1.5">
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-1 md:hidden">
                <TeamLogo {...homeTeam} size="sm" />
                <span className="truncate text-[10px] font-medium text-muted">
                  {homeTeam.shortName}
                </span>
              </div>
              <p className="mb-1 hidden text-[10px] font-medium text-muted md:block">
                {homeTeam.shortName}
              </p>
              <ScorerChips
                scorers={homeScorers}
                showResults={showResults}
                showMisses={showMisses}
              />
            </div>
            <div className="min-w-0 text-end">
              <div className="mb-1 flex items-center justify-end gap-1 md:hidden">
                <span className="truncate text-[10px] font-medium text-muted">
                  {awayTeam.shortName}
                </span>
                <TeamLogo {...awayTeam} size="sm" />
              </div>
              <p className="mb-1 hidden text-[10px] font-medium text-muted md:block">
                {awayTeam.shortName}
              </p>
              <ScorerChips
                scorers={awayScorers}
                align="end"
                showResults={showResults}
                showMisses={showMisses}
              />
            </div>
          </div>
        ) : (
          (() => {
            const groupedHome = allScorers.filter(s => s.player.teamId === homeTeamId);
            const groupedAway = allScorers.filter(s => s.player.teamId === awayTeamId);
            if (groupedHome.length > 0 || groupedAway.length > 0) {
              return (
                <div className="grid w-full grid-cols-2 gap-1.5">
                  <div className="min-w-0">
                    <div className="mb-1 flex items-center gap-1 md:hidden">
                      <TeamLogo {...homeTeam} size="sm" />
                      <span className="truncate text-[10px] font-medium text-muted">
                        {homeTeam.shortName}
                      </span>
                    </div>
                    <p className="mb-1 hidden text-[10px] font-medium text-muted md:block">
                      {homeTeam.shortName}
                    </p>
                    <ScorerChips scorers={groupedHome} showResults={showResults} showMisses={showMisses} />
                  </div>
                  <div className="min-w-0 text-end">
                    <div className="mb-1 flex items-center justify-end gap-1 md:hidden">
                      <span className="truncate text-[10px] font-medium text-muted">
                        {awayTeam.shortName}
                      </span>
                      <TeamLogo {...awayTeam} size="sm" />
                    </div>
                    <p className="mb-1 hidden text-[10px] font-medium text-muted md:block">
                      {awayTeam.shortName}
                    </p>
                    <ScorerChips scorers={groupedAway} align="end" showResults={showResults} showMisses={showMisses} />
                  </div>
                </div>
              );
            }

            return (
              <div className="w-full">
                <p className="mb-1 hidden text-[10px] font-medium text-muted md:block text-center">Scorers</p>
                <div className="flex justify-center">
                  <ScorerChips scorers={allScorers} showResults={showResults} showMisses={showMisses} />
                </div>
              </div>
            );
          })()
        )
      )}
    </div>
  );
}

function ScorerChips({
  scorers,
  align = "start",
  showResults = false,
  showMisses = false,
}: {
  scorers: LeagueMatchPredictionRow["scorerPredictions"];
  align?: "start" | "end";
  showResults?: boolean;
  showMisses?: boolean;
}) {
  if (scorers.length === 0) {
    return <span className="text-xs text-muted/60">—</span>;
  }

  return (
    <div
      className={`flex flex-wrap gap-1 ${align === "end" ? "justify-end" : "justify-start"}`}
    >
      {scorers.map((pick) => {
        const hit = showResults && (pick.points ?? 0) > 0;
        const miss = showMisses && (pick.points ?? 0) <= 0;
        return (
          <span
            key={pick.player.id}
            title={pick.player.name}
            className={`inline-flex max-w-full items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] ring-1 md:px-2 md:text-[11px] ${
              hit
                ? "bg-primary/10 text-primary/90 ring-primary/20"
                : miss
                  ? "bg-card-border/40 text-muted ring-card-border/60"
                  : "bg-card-border/30 text-foreground/80 ring-card-border/50"
            }`}
          >
            {hit && (
              <span className="text-[10px] font-bold text-primary">✓</span>
            )}
            {miss && (
              <span className="text-[10px] text-danger">✗</span>
            )}
            {shortPlayerName(pick.player.name)}
            {pick.predictedGoals > 1 && (
              <span className="font-bold text-warning">×{pick.predictedGoals}</span>
            )}
            {showResults && pick.points != null && (
              <span
                className={`text-[10px] font-bold ${
                  pick.points > 0
                    ? "text-primary"
                    : pick.points < 0
                      ? "text-danger"
                      : "text-muted"
                }`}
              >
                {pick.points > 0 ? `+${pick.points}` : pick.points}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

function KnockoutExtras({
  row,
  homeTeamId,
  awayTeamId,
  homeShortName,
  awayShortName,
  t,
}: {
  row: LeagueMatchPredictionRow;
  homeTeamId: string;
  awayTeamId: string;
  homeShortName: string;
  awayShortName: string;
  t: Messages;
}) {
  const finishType = asFinishType(row.prediction?.predictedFinishType);
  const penaltyTeamId = row.prediction?.predictedPenaltyWinnerTeamId;
  const penaltyShort =
    penaltyTeamId === homeTeamId
      ? homeShortName
      : penaltyTeamId === awayTeamId
        ? awayShortName
        : null;

  if (!finishType && !penaltyShort) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-card-border/60 pt-2">
      {finishType && (
        <span className="inline-flex items-center gap-1 rounded-lg bg-accent/10 px-2 py-1 text-[11px] text-accent">
          <span className="text-muted">{t.matches.finishType}:</span>
          {t.finishType[finishType]}
        </span>
      )}
      {penaltyShort && (
        <span className="inline-flex items-center gap-1 rounded-lg bg-card-border/50 px-2 py-1 text-[11px]">
          <span className="text-muted">{t.matches.penaltyWinner}:</span>
          <span className="font-medium">{penaltyShort}</span>
        </span>
      )}
    </div>
  );
}

function LeaguePredictionRow({
  row,
  index,
  isMe,
  isFinished,
  matchStatus,
  isKnockout,
  matchResult,
  homeTeamId,
  awayTeamId,
  homeTeam,
  awayTeam,
  homeShortName,
  awayShortName,
  t,
}: {
  row: LeagueMatchPredictionRow;
  index: number;
  isMe: boolean;
  isFinished: boolean;
  matchStatus: string;
  isKnockout: boolean;
  matchResult?: LeagueMatchResultContext | null;
  homeTeamId: string;
  awayTeamId: string;
  homeTeam: LeagueTeamInfo;
  awayTeam: LeagueTeamInfo;
  homeShortName: string;
  awayShortName: string;
  t: Messages;
}) {
  const [open, setOpen] = useState(false);
  const isLive = matchStatus === "LIVE";
  const hasScoringContext = !!matchResult && (isFinished || isLive);
  const showScorerResults = hasScoringContext;
  const showScoreResults = isFinished && !!matchResult;
  const hasDouble = Boolean(row.prediction?.isDouble);
  const hasBold = Boolean(row.boldScorerBet);

  const homeScorers = row.scorerPredictions.filter(
    (p) => p.player.teamId === homeTeamId
  );
  const awayScorers = row.scorerPredictions.filter(
    (p) => p.player.teamId === awayTeamId
  );

  const breakdownInput =
    hasScoringContext && matchResult
      ? leagueRowToBreakdownInput(row, matchResult)
      : null;

  const breakdown = breakdownInput
      ? buildMatchPointsBreakdown(breakdownInput, t, {
        showMisses: isFinished,
        scorersOnly: isLive && !isFinished,
      })
    : buildLeaguePendingBreakdown(
        row,
        {
          isKnockout,
          homeTeamId,
          awayTeamId,
          homeShortName,
          awayShortName,
        },
        t
      );

  const totalPoints = breakdown.total;

  const hasBreakdown = breakdown.lines.length > 0;

  return (
    <li
      className={`relative px-3 py-3 transition-colors md:px-5 md:py-4 ${
        hasDouble
          ? "border-s-4 border-orange-300 bg-gradient-to-br from-orange-950/80 via-orange-900/45 to-amber-500/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_35px_rgba(124,45,18,0.28)] ring-1 ring-inset ring-orange-300/50"
          : hasBold
            ? "border-s-4 border-red-400 bg-gradient-to-br from-red-950/85 via-red-900/45 to-rose-500/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_35px_rgba(127,29,29,0.28)] ring-1 ring-inset ring-red-400/50"
            : isMe
              ? "bg-primary/[0.07] ring-1 ring-inset ring-primary/25"
              : index % 2 === 0
                ? "bg-transparent"
                : "bg-background/20"
      }`}
    >
      <div className="flex flex-col gap-2.5 md:grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:items-start md:gap-4">
        <div className="flex min-w-0 items-center justify-between gap-2 md:block">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-semibold md:text-base">
              {row.username}
            </span>
            {isMe && (
              <span className="shrink-0 rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                {t.matches.you}
              </span>
            )}
          </div>
          <FeatureBadges row={row} isKnockout={isKnockout} t={t} />
        </div>

        <PredictionScoreboard
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          predHome={row.prediction?.predHome}
          predAway={row.prediction?.predAway}
          homeScorers={homeScorers}
          awayScorers={awayScorers}
          allScorers={row.scorerPredictions}
          homeTeamId={homeTeamId}
          awayTeamId={awayTeamId}
          scorePoints={showScoreResults ? row.prediction?.points : undefined}
          showResults={showScorerResults}
          showMisses={isFinished}
        />
      </div>

      {isKnockout && (
        <KnockoutExtras
          row={row}
          homeTeamId={homeTeamId}
          awayTeamId={awayTeamId}
          homeShortName={homeShortName}
          awayShortName={awayShortName}
          t={t}
        />
      )}

      {hasBreakdown && (
        <div className="mt-3 border-t border-card-border/60 pt-3">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-2 transition-colors md:px-3 ${
              totalPoints > 0
                ? "border-primary/40 bg-primary/10 hover:bg-primary/15"
                : totalPoints < 0
                  ? "border-danger/40 bg-danger/10 hover:bg-danger/15"
                  : "border-card-border/80 bg-background/40 hover:bg-background/60"
            }`}
          >
            <div className="text-start">
              <p className="text-[10px] text-muted">{t.matches.pointsEarned}</p>
              <p
                className={`text-lg font-bold tabular-nums ${
                  totalPoints > 0
                    ? "text-primary"
                    : totalPoints < 0
                      ? "text-danger"
                      : "text-muted"
                }`}
              >
                {totalPoints > 0 ? `+${totalPoints}` : totalPoints}{" "}
                <span className="text-xs font-medium">{t.profile.pointsShort}</span>
              </p>
            </div>
            <span className="shrink-0 text-end text-[10px] text-muted md:text-xs">
              <span className="hidden sm:inline">
                {open ? t.pointsBreakdown.hideDetails : t.matches.tapForDetails}{" "}
              </span>
              {open ? "▲" : "▼"}
            </span>
          </button>
          {open && (
            <div className="mt-2 rounded-lg border border-card-border/60 bg-background/30 p-3">
              {isLive && !isFinished && (
                <p className="mb-2 text-[10px] text-warning">
                  {t.pointsBreakdown.liveScorerHint}
                </p>
              )}
              {!hasScoringContext && (
                <p className="mb-2 text-[10px] text-warning">
                  {t.pointsBreakdown.pendingHint}
                </p>
              )}
              <PointsBreakdownLines
                lines={breakdown.lines}
                total={totalPoints}
                compact
              />
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function ScoreboardTeamsHeader({
  homeTeam,
  awayTeam,
  compact = false,
  actualHomeScore,
  actualAwayScore,
}: {
  homeTeam: LeagueTeamInfo;
  awayTeam: LeagueTeamInfo;
  compact?: boolean;
  actualHomeScore?: number;
  actualAwayScore?: number;
}) {
  const showActual =
    actualHomeScore != null && actualAwayScore != null;
  return (
    <div
      className={`flex items-center justify-center gap-2 ${compact ? "text-[10px]" : "text-[11px]"}`}
      dir="ltr"
    >
      <div className="flex min-w-0 max-w-[42%] items-center gap-1">
        <TeamLogo {...homeTeam} size="sm" />
        <span className="truncate font-medium uppercase">{homeTeam.shortName}</span>
      </div>
      <span
        className={`shrink-0 tabular-nums font-bold ${
          showActual ? "text-primary" : "text-muted/50"
        }`}
      >
        {showActual ? `${actualHomeScore}-${actualAwayScore}` : "-"}
      </span>
      <div className="flex min-w-0 max-w-[42%] items-center gap-1">
        <TeamLogo {...awayTeam} size="sm" />
        <span className="truncate font-medium uppercase">{awayTeam.shortName}</span>
      </div>
    </div>
  );
}

export function LeaguePredictionsList({
  rows,
  homeTeamId,
  awayTeamId,
  homeTeam,
  awayTeam,
  homeShortName,
  awayShortName,
  isKnockout,
  isFinished,
  matchStatus,
  matchResult,
  currentUserId,
}: LeaguePredictionsListProps) {
  const { messages: t } = useI18n();

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-card-border bg-card/40 px-6 py-12 text-center">
        <p className="text-3xl opacity-40" aria-hidden>
          📋
        </p>
        <p className="mt-3 text-sm text-muted">{t.matches.noLeaguePredictions}</p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden rounded-xl border border-card-border bg-card/80 shadow-lg shadow-black/20 md:rounded-2xl">
      <div className="border-b border-card-border bg-background/40 px-3 py-2.5 md:grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:items-center md:gap-4 md:px-5 md:py-3">
        <span className="mb-2 block text-center text-[10px] font-medium uppercase tracking-wide text-muted md:mb-0 md:text-end md:text-[11px]">
          {t.matches.scoreboardPlayer}
        </span>
        <ScoreboardTeamsHeader
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          compact
          actualHomeScore={
            matchStatus === "LIVE" || isFinished
              ? matchResult?.homeScore
              : undefined
          }
          actualAwayScore={
            matchStatus === "LIVE" || isFinished
              ? matchResult?.awayScore
              : undefined
          }
        />
      </div>

      <ul className="divide-y divide-card-border/80">
        {rows.map((row, index) => (
          <LeaguePredictionRow
            key={row.userId}
            row={row}
            index={index}
            isMe={row.userId === currentUserId}
            isFinished={isFinished}
            matchStatus={matchStatus}
            isKnockout={isKnockout}
            matchResult={matchResult}
            homeTeamId={homeTeamId}
            awayTeamId={awayTeamId}
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            homeShortName={homeShortName}
            awayShortName={awayShortName}
            t={t}
          />
        ))}
      </ul>
    </div>
  );
}
