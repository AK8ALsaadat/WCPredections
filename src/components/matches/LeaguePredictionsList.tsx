"use client";

import { useState } from "react";
import type { LeagueMatchPredictionRow } from "@/types";
import { asFinishType } from "@/lib/finish-type";
import {
  buildLeaguePendingBreakdown,
  buildMatchPointsBreakdown,
  getMatchTotalUserPoints,
  leagueRowToBreakdownInput,
  type LeagueMatchResultContext,
} from "@/lib/match-points-breakdown";
import { PointsBreakdownLines } from "@/components/matches/PointsBreakdownLines";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { Messages } from "@/lib/i18n/ar";

type LeaguePredictionsListProps = {
  rows: LeagueMatchPredictionRow[];
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeShortName: string;
  awayShortName: string;
  isKnockout: boolean;
  isFinished: boolean;
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
        <span
          title={t.matches.featureDouble}
          className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-warning/20 px-1.5 text-[10px] font-bold text-warning ring-1 ring-warning/30"
        >
          2×
        </span>
      )}
      {hasBold && (
        <span
          title={`${t.matches.featureBold}: ${row.boldScorerBet!.player.name}`}
          className="inline-flex h-6 items-center gap-0.5 rounded-md bg-amber-500/15 px-1.5 text-[10px] font-semibold text-amber-400 ring-1 ring-amber-500/25"
        >
          <span aria-hidden>✦</span>
          <span className="max-w-[4rem] truncate">
            {shortPlayerName(row.boldScorerBet!.player.name)}
          </span>
        </span>
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
  homeTeamName,
  awayTeamName,
  predHome,
  predAway,
  homeScorers,
  awayScorers,
  scorePoints,
  showResults,
}: {
  homeTeamName: string;
  awayTeamName: string;
  predHome?: number;
  predAway?: number;
  homeScorers: LeagueMatchPredictionRow["scorerPredictions"];
  awayScorers: LeagueMatchPredictionRow["scorerPredictions"];
  scorePoints?: number | null;
  showResults: boolean;
}) {
  const hasScore = predHome != null && predAway != null;

  return (
    <div className="flex w-full flex-col items-center gap-2 md:max-w-xs md:justify-self-center">
      <div className="flex w-full items-center justify-center gap-1.5 md:hidden">
        <span className="text-[10px] font-medium text-muted">{homeTeamName}</span>
        <span className="text-[10px] text-muted/50">·</span>
        <span className="text-[10px] font-medium text-muted">{awayTeamName}</span>
      </div>

      {hasScore ? (
        <div
          className="flex items-baseline gap-2 tabular-nums tracking-tight"
          dir="ltr"
        >
          <span className="text-xl font-bold">{predHome}</span>
          <span className="text-base font-light text-muted">-</span>
          <span className="text-xl font-bold">{predAway}</span>
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

      {(homeScorers.length > 0 || awayScorers.length > 0) && (
        <div className="grid w-full grid-cols-2 gap-2">
          <div className="min-w-0">
            <p className="mb-1 hidden text-[10px] font-medium text-muted md:block">
              {homeTeamName}
            </p>
            <ScorerChips scorers={homeScorers} showResults={showResults} />
          </div>
          <div className="min-w-0 text-end">
            <p className="mb-1 hidden text-[10px] font-medium text-muted md:block">
              {awayTeamName}
            </p>
            <ScorerChips
              scorers={awayScorers}
              align="end"
              showResults={showResults}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ScorerChips({
  scorers,
  align = "start",
  showResults = false,
}: {
  scorers: LeagueMatchPredictionRow["scorerPredictions"];
  align?: "start" | "end";
  showResults?: boolean;
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
        const miss = showResults && (pick.points ?? 0) <= 0;
        return (
          <span
            key={pick.player.id}
            title={pick.player.name}
            className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] ring-1 ${
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
  isKnockout,
  matchResult,
  homeTeamId,
  awayTeamId,
  homeTeamName,
  awayTeamName,
  homeShortName,
  awayShortName,
  t,
}: {
  row: LeagueMatchPredictionRow;
  index: number;
  isMe: boolean;
  isFinished: boolean;
  isKnockout: boolean;
  matchResult?: LeagueMatchResultContext | null;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeShortName: string;
  awayShortName: string;
  t: Messages;
}) {
  const [open, setOpen] = useState(false);
  const showResults = isFinished && !!matchResult;

  const homeScorers = row.scorerPredictions.filter(
    (p) => p.player.teamId === homeTeamId
  );
  const awayScorers = row.scorerPredictions.filter(
    (p) => p.player.teamId === awayTeamId
  );

  const breakdownInput =
    showResults && matchResult
      ? leagueRowToBreakdownInput(row, matchResult)
      : null;

  const breakdown = breakdownInput
    ? buildMatchPointsBreakdown(breakdownInput, t, { showMisses: true })
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

  const totalPoints = breakdownInput
    ? getMatchTotalUserPoints(breakdownInput)
    : 0;

  const hasBreakdown = breakdown.lines.length > 0;

  return (
    <li
      className={`px-4 py-4 transition-colors md:px-5 ${
        isMe
          ? "bg-primary/[0.07] ring-1 ring-inset ring-primary/25"
          : index % 2 === 0
            ? "bg-transparent"
            : "bg-background/20"
      }`}
    >
      <div className="md:grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:items-start md:gap-4">
        <div className="mb-3 flex min-w-0 items-center gap-2 md:mb-0">
          <FeatureBadges row={row} isKnockout={isKnockout} t={t} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-semibold">@{row.username}</span>
              {isMe && (
                <span className="shrink-0 rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">
                  {t.matches.you}
                </span>
              )}
            </div>
          </div>
        </div>

        <PredictionScoreboard
          homeTeamName={homeTeamName}
          awayTeamName={awayTeamName}
          predHome={row.prediction?.predHome}
          predAway={row.prediction?.predAway}
          homeScorers={homeScorers}
          awayScorers={awayScorers}
          scorePoints={showResults ? row.prediction?.points : undefined}
          showResults={showResults}
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
            className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 transition-colors ${
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
            <span className="text-xs text-muted">
              {open ? t.pointsBreakdown.hideDetails : t.matches.tapForDetails}{" "}
              {open ? "▲" : "▼"}
            </span>
          </button>
          {open && (
            <div className="mt-2 rounded-lg border border-card-border/60 bg-background/30 p-3">
              {!showResults && (
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

export function LeaguePredictionsList({
  rows,
  homeTeamId,
  awayTeamId,
  homeTeamName,
  awayTeamName,
  homeShortName,
  awayShortName,
  isKnockout,
  isFinished,
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
    <div className="overflow-hidden rounded-2xl border border-card-border bg-card/80 shadow-lg shadow-black/20">
      <div className="hidden border-b border-card-border bg-background/40 px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted md:grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:gap-4 md:px-5">
        <span>{t.matches.scoreboardPlayer}</span>
        <span className="text-center">
          {homeShortName}
          <span className="mx-1.5 text-muted/50">-</span>
          {awayShortName}
        </span>
      </div>

      <ul className="divide-y divide-card-border/80">
        {rows.map((row, index) => (
          <LeaguePredictionRow
            key={row.userId}
            row={row}
            index={index}
            isMe={row.userId === currentUserId}
            isFinished={isFinished}
            isKnockout={isKnockout}
            matchResult={matchResult}
            homeTeamId={homeTeamId}
            awayTeamId={awayTeamId}
            homeTeamName={homeTeamName}
            awayTeamName={awayTeamName}
            homeShortName={homeShortName}
            awayShortName={awayShortName}
            t={t}
          />
        ))}
      </ul>
    </div>
  );
}
