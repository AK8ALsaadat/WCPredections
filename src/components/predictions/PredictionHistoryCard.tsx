"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
const MatchPointsBreakdown = dynamic(
  () => import("@/components/matches/MatchPointsBreakdown").then((m) => ({ default: m.MatchPointsBreakdown })),
  { ssr: false }
);
import {
  entryToBreakdownInput,
  getPredictionOutcome,
  type MatchHistoryEntry,
} from "@/lib/profile-history";
import { formatDate } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { ViewLeaguePredictionsButton } from "@/components/matches/ViewLeaguePredictionsButton";
import { getMatchTotalUserPoints } from "@/lib/match-points-breakdown";

function OutcomeBadge({ outcome }: { outcome: ReturnType<typeof getPredictionOutcome> }) {
  const { messages: t } = useI18n();

  if (outcome === "none") return null;

  const styles = {
    pending: "border-warning/40 bg-warning/10 text-warning",
    exact: "border-primary/40 bg-primary/10 text-primary",
    winner: "border-primary/30 bg-primary/5 text-primary",
    wrong: "border-danger/40 bg-danger/10 text-danger",
  } as const;

  const labels = {
    pending: t.predictions.pending,
    exact: t.predictions.correctExact,
    winner: t.predictions.correctWinner,
    wrong: t.predictions.wrong,
    none: "",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${styles[outcome]}`}
    >
      {outcome === "exact" || outcome === "winner" ? (
        <span aria-hidden>✓</span>
      ) : outcome === "wrong" ? (
        <span aria-hidden>✗</span>
      ) : null}
      {labels[outcome]}
    </span>
  );
}

export function PredictionHistoryCard({ entry, defaultOpen = false }: { entry: MatchHistoryEntry; defaultOpen?: boolean }) {
  const { messages: t, locale } = useI18n();
  const [open, setOpen] = useState(defaultOpen);
  const m = entry.match;
  const outcome = getPredictionOutcome(entry);
  const breakdownInput = entryToBreakdownInput(entry);
  const isLive =
    m.status === "LIVE" && m.homeScore != null && m.awayScore != null;
  const isFinished =
    m.status === "FINISHED" && m.homeScore != null && m.awayScore != null;
  const livePoints = isLive && breakdownInput
    ? getMatchTotalUserPoints(breakdownInput)
    : null;

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <OutcomeBadge outcome={outcome} />
            <span className="text-xs text-muted">{m.round.name}</span>
          </div>
          <Link
            href={`/matches/${m.id}`}
            className="font-semibold text-primary hover:underline"
          >
            {m.homeTeam.shortName} vs {m.awayTeam.shortName}
          </Link>
          <p className="mt-1 text-xs text-muted">
            {formatDate(m.matchTime, locale)}
          </p>
          {entry.prediction && (
            <p className="mt-2 text-sm">
              <span className="text-muted">{t.profile.predicted}: </span>
              <span className="font-bold tabular-nums">
                {entry.prediction.predHome}-{entry.prediction.predAway}
              </span>
              {entry.prediction.isDouble && (
                <span className="mr-1 text-warning"> 2×</span>
              )}
            </p>
          )}
          {isFinished && (
            <p className="text-sm text-muted">
              {t.profile.actual}: {m.homeScore}-{m.awayScore}
            </p>
          )}
          {isLive && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-danger/15 px-2 py-1 text-xs font-bold text-danger">
                {t.status.LIVE} {m.homeScore}-{m.awayScore}
              </span>
              <span className="rounded-full bg-primary/15 px-2 py-1 text-xs font-bold text-primary">
                {t.matches.pointsEarned}: {livePoints ?? 0}
              </span>
            </div>
          )}
          {entry.scorers.length > 0 && (
            <p className="mt-1 text-xs text-muted">
              {t.predictions.scorers}:{" "}
              {entry.scorers.map((s) => s.player.name).join("، ")}
            </p>
          )}
          {entry.bold && (
            <p className="mt-1 text-xs text-amber-400">
              ✦ {entry.bold.player.name}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {breakdownInput && !defaultOpen && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="text-xs font-medium text-primary hover:underline"
            >
              {open ? t.matches.hidePointsBreakdown : t.matches.showPointsBreakdown}
            </button>
          )}
          <Link
            href={`/matches/${m.id}`}
            className="text-xs text-muted hover:text-foreground"
          >
            {t.predictions.viewMatch} →
          </Link>
        </div>
      </div>

      {open && breakdownInput && (
        <div className="mt-4 border-t border-card-border pt-4">
          <MatchPointsBreakdown {...breakdownInput} compact />
        </div>
      )}

      {(isLive || isFinished) && (
        <div className="mt-4">
          <ViewLeaguePredictionsButton matchId={m.id} fullWidth />
        </div>
      )}

      {!isFinished && entry.prediction && (
        <p className="mt-3 text-xs text-muted">
          {t.status[m.status as keyof typeof t.status] ?? m.status}
        </p>
      )}
    </Card>
  );
}
