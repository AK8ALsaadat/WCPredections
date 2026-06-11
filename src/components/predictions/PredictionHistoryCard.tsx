"use client";

import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { MatchPointsBreakdown } from "@/components/matches/MatchPointsBreakdown";
import {
  entryToBreakdownInput,
  getPredictionOutcome,
  type MatchHistoryEntry,
} from "@/lib/profile-history";
import { formatDate } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/LocaleProvider";

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

export function PredictionHistoryCard({ entry }: { entry: MatchHistoryEntry }) {
  const { messages: t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const m = entry.match;
  const outcome = getPredictionOutcome(entry);
  const breakdownInput = entryToBreakdownInput(entry);
  const isFinished =
    m.status === "FINISHED" && m.homeScore != null && m.awayScore != null;

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
          {breakdownInput && (
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

      {!isFinished && entry.prediction && (
        <p className="mt-3 text-xs text-muted">
          {t.status[m.status as keyof typeof t.status] ?? m.status}
        </p>
      )}
    </Card>
  );
}
