"use client";

import { useState } from "react";
import type { LeagueMatchPredictionRow } from "@/types";
import { asFinishType } from "@/lib/finish-type";
import {
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

function TeamPredictionColumn({
  teamName,
  goals,
  scorers,
  align = "start",
  scorePoints,
  isFinished,
}: {
  teamName: string;
  goals?: number;
  scorers: LeagueMatchPredictionRow["scorerPredictions"];
  align?: "start" | "end";
  scorePoints?: number | null;
  isFinished?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-1 ${
        align === "end" ? "items-end text-end" : "items-start text-start"
      }`}
    >
      <p className="text-[10px] font-medium text-muted md:hidden">{teamName}</p>
      {goals != null ? (
        <span
          className="text-xl font-bold tabular-nums tracking-tight"
          dir="ltr"
        >
          {goals}
        </span>
      ) : (
        <span className="text-lg text-muted">—</span>
      )}
      <ScorerChips scorers={scorers} align={align} />
      {isFinished && scorePoints != null && align === "start" && (
        <span
          className={`text-[10px] font-bold ${
            scorePoints > 0 ? "text-primary" : "text-danger"
          }`}
        >
          {scorePoints > 0 ? `✓ +${scorePoints}` : "✗ 0"}
        </span>
      )}
    </div>
  );
}

function ScorerChips({
  scorers,
  align = "start",
}: {
  scorers: LeagueMatchPredictionRow["scorerPredictions"];
  align?: "start" | "end";
}) {
  if (scorers.length === 0) {
    return <span className="text-xs text-muted/60">—</span>;
  }

  return (
    <div
      className={`flex flex-wrap gap-1 ${align === "end" ? "justify-end" : "justify-start"}`}
    >
      {scorers.map((pick) => {
        const hit = (pick.points ?? 0) > 0;
        return (
          <span
            key={pick.player.id}
            title={pick.player.name}
            className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] ring-1 ${
              hit
                ? "bg-primary/10 text-primary/90 ring-primary/20"
                : "bg-card-border/40 text-muted ring-card-border/60"
            }`}
          >
            {hit ? (
              <span className="text-[10px] font-bold text-primary">✓</span>
            ) : (
              <span className="text-[10px] text-danger">✗</span>
            )}
            {shortPlayerName(pick.player.name)}
            {pick.predictedGoals > 1 && (
              <span className="font-bold text-warning">×{pick.predictedGoals}</span>
            )}
            {pick.points != null && (
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
  const [open, setOpen] = useState(isMe);

  const homeScorers = row.scorerPredictions.filter(
    (p) => p.player.teamId === homeTeamId
  );
  const awayScorers = row.scorerPredictions.filter(
    (p) => p.player.teamId === awayTeamId
  );

  const breakdownInput =
    isFinished && matchResult
      ? leagueRowToBreakdownInput(row, matchResult)
      : null;

  const totalPoints = breakdownInput
    ? getMatchTotalUserPoints(breakdownInput)
    : null;

  const breakdown =
    breakdownInput && totalPoints != null
      ? buildMatchPointsBreakdown(breakdownInput, t, { showMisses: true })
      : null;

  const hasBreakdown = Boolean(breakdown && breakdown.lines.length > 0);

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
      <div className="md:grid md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] md:items-start md:gap-3">
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
            {totalPoints != null && (
              <p className="mt-0.5 text-[11px] text-muted">
                {t.matches.pointsEarned}:{" "}
                <span
                  className={`font-bold tabular-nums ${
                    totalPoints > 0
                      ? "text-primary"
                      : totalPoints < 0
                        ? "text-danger"
                        : "text-muted"
                  }`}
                >
                  {totalPoints > 0 ? `+${totalPoints}` : totalPoints}
                </span>
              </p>
            )}
          </div>
        </div>

        <div className="mb-2 md:mb-0">
          <TeamPredictionColumn
            teamName={homeTeamName}
            goals={row.prediction?.predHome}
            scorers={homeScorers}
            scorePoints={
              isFinished && matchResult ? row.prediction?.points : undefined
            }
            isFinished={isFinished && !!matchResult}
          />
        </div>

        <div>
          <TeamPredictionColumn
            teamName={awayTeamName}
            goals={row.prediction?.predAway}
            scorers={awayScorers}
            align="end"
          />
        </div>
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

      {hasBreakdown && breakdown && (
        <div className="mt-3 border-t border-card-border/60 pt-3">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-card-border/80 bg-background/40 px-3 py-2 text-xs font-medium text-muted transition-colors hover:bg-background/60"
          >
            <span>{t.matches.pointsBreakdownTitle}</span>
            <span>
              {open ? t.matches.hidePointsBreakdown : t.matches.showPointsBreakdown}{" "}
              {open ? "▲" : "▼"}
            </span>
          </button>
          {open && (
            <div className="mt-2 rounded-lg border border-card-border/60 bg-background/30 p-3">
              <PointsBreakdownLines
                lines={breakdown.lines}
                total={breakdown.total}
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
      <div className="hidden border-b border-card-border bg-background/40 px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted md:grid md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] md:gap-3 md:px-5">
        <span>{t.matches.scoreboardPlayer}</span>
        <span>{homeShortName}</span>
        <span className="text-end">{awayShortName}</span>
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
