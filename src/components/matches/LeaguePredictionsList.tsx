"use client";

import type { LeagueMatchPredictionRow } from "@/types";
import { asFinishType } from "@/lib/finish-type";
import { useI18n } from "@/lib/i18n/LocaleProvider";

type LeaguePredictionsListProps = {
  rows: LeagueMatchPredictionRow[];
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  isKnockout: boolean;
  isFinished: boolean;
  currentUserId?: string;
};

function shortPlayerName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : name;
}

function ScorerPicks({
  scorers,
}: {
  scorers: LeagueMatchPredictionRow["scorerPredictions"];
}) {
  if (scorers.length === 0) return <span className="text-muted">—</span>;

  return (
    <ul className="space-y-0.5">
      {scorers.map((pick) => (
        <li key={pick.player.id} className="text-sm">
          {shortPlayerName(pick.player.name)}
          {pick.predictedGoals > 1 && (
            <span className="text-warning"> ×{pick.predictedGoals}</span>
          )}
          {pick.points != null && pick.points > 0 && (
            <span className="mr-1 text-primary"> +{pick.points}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function LeaguePredictionsList({
  rows,
  homeTeamId,
  awayTeamId,
  homeTeamName,
  awayTeamName,
  isKnockout,
  isFinished,
  currentUserId,
}: LeaguePredictionsListProps) {
  const { messages: t } = useI18n();

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-card-border bg-card/50 px-4 py-6 text-center text-sm text-muted">
        {t.matches.noLeaguePredictions}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const homeScorers = row.scorerPredictions.filter(
          (p) => p.player.teamId === homeTeamId
        );
        const awayScorers = row.scorerPredictions.filter(
          (p) => p.player.teamId === awayTeamId
        );
        const finishType = asFinishType(row.prediction?.predictedFinishType);
        const penaltyTeamId = row.prediction?.predictedPenaltyWinnerTeamId;
        const penaltyName =
          penaltyTeamId === homeTeamId
            ? homeTeamName
            : penaltyTeamId === awayTeamId
              ? awayTeamName
              : null;
        const totalPoints =
          isFinished && row.prediction
            ? (row.prediction.points ?? 0) +
              (row.prediction.finishTypePoints ?? 0) +
              (row.prediction.penaltyWinnerPoints ?? 0) +
              row.scorerPredictions.reduce((sum, p) => sum + (p.points ?? 0), 0) +
              (row.boldScorerBet?.points ?? 0)
            : null;

        return (
          <div
            key={row.userId}
            className={`rounded-xl border px-4 py-4 ${
              row.userId === currentUserId
                ? "border-primary/40 bg-primary/5"
                : "border-card-border"
            }`}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="font-semibold">@{row.username}</span>
              {row.userId === currentUserId && (
                <span className="rounded bg-primary/15 px-2 py-0.5 text-xs text-primary">
                  {t.matches.you}
                </span>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-start">
              <div>
                <p className="mb-1 text-xs text-muted">{homeTeamName}</p>
                <ScorerPicks scorers={homeScorers} />
              </div>

              <div className="text-center">
                {row.prediction ? (
                  <>
                    <p className="text-2xl font-bold">
                      {row.prediction.predHome} - {row.prediction.predAway}
                    </p>
                    {row.prediction.isDouble && (
                      <span className="mt-1 inline-block rounded bg-warning/15 px-2 py-0.5 text-xs font-semibold text-warning">
                        2x
                      </span>
                    )}
                  </>
                ) : (
                  <p className="text-muted">—</p>
                )}
              </div>

              <div className="sm:text-left">
                <p className="mb-1 text-xs text-muted sm:text-right">
                  {awayTeamName}
                </p>
                <div className="sm:text-right">
                  <ScorerPicks scorers={awayScorers} />
                </div>
              </div>
            </div>

            {(row.boldScorerBet || (isKnockout && finishType) || penaltyName) && (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-card-border pt-3">
                {row.boldScorerBet && (
                  <span className="rounded bg-warning/10 px-2 py-1 text-xs text-warning">
                    {t.predict.boldScorerBet.title}:{" "}
                    {shortPlayerName(row.boldScorerBet.player.name)}
                  </span>
                )}
                {isKnockout && finishType && (
                  <span className="rounded bg-card-border/60 px-2 py-1 text-xs text-muted">
                    {t.finishType[finishType]}
                  </span>
                )}
                {penaltyName && (
                  <span className="rounded bg-card-border/60 px-2 py-1 text-xs text-muted">
                    {t.matches.penaltyWinner}: {penaltyName}
                  </span>
                )}
              </div>
            )}

            {totalPoints != null && (
              <p className="mt-2 text-sm text-muted">
                {t.matches.pointsEarned}:{" "}
                <span
                  className={
                    totalPoints > 0 ? "font-semibold text-primary" : ""
                  }
                >
                  {totalPoints}
                </span>
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
