"use client";

import { useState } from "react";
import {
  buildMatchPointsBreakdown,
  getMatchTotalUserPoints,
  type MatchPointsBreakdownInput,
} from "@/lib/match-points-breakdown";
import { useI18n } from "@/lib/i18n/LocaleProvider";

type MatchPointsBreakdownProps = MatchPointsBreakdownInput & {
  penaltyWinnerName?: string | null;
  compact?: boolean;
  className?: string;
};

export function MatchPointsBreakdown({
  compact = false,
  className = "",
  ...input
}: MatchPointsBreakdownProps) {
  const { messages: t } = useI18n();
  const [open, setOpen] = useState(false);
  const total = getMatchTotalUserPoints(input);
  const { lines } = buildMatchPointsBreakdown(input, t);

  if (
    !input.userPrediction &&
    (input.userScorerPredictions?.length ?? 0) === 0 &&
    !input.userBoldScorerBet
  ) {
    return null;
  }

  return (
    <div className={className} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border transition-colors ${
          total > 0
            ? "border-primary/40 bg-primary/10 hover:bg-primary/15"
            : total < 0
              ? "border-danger/40 bg-danger/10 hover:bg-danger/15"
              : "border-card-border bg-card-border/20 hover:bg-card-border/30"
        } ${compact ? "px-3 py-2" : "px-4 py-3"}`}
      >
        <div className="text-end">
          <p className={`text-muted ${compact ? "text-[10px]" : "text-xs"}`}>
            {t.matches.matchPoints}
          </p>
          <p
            className={`font-bold tabular-nums ${
              total > 0
                ? "text-primary"
                : total < 0
                  ? "text-danger"
                  : "text-muted"
            } ${compact ? "text-lg" : "text-2xl"}`}
          >
            {total} {t.profile.pointsShort}
          </p>
        </div>
        <span className={`text-muted ${compact ? "text-[10px]" : "text-xs"}`}>
          {open ? t.pointsBreakdown.hideDetails : t.matches.tapForDetails}{" "}
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div
          className={`mt-2 space-y-2 rounded-lg border border-card-border bg-background/60 ${
            compact ? "p-2" : "p-3"
          }`}
        >
          {lines.length === 0 ? (
            <p className={`text-muted ${compact ? "text-xs" : "text-sm"}`}>
              {t.matches.noPointsEarned}
            </p>
          ) : (
            lines.map((line) => (
              <div
                key={line.id}
                className="flex items-start justify-between gap-3 border-b border-card-border/40 pb-2 last:border-0 last:pb-0"
              >
                <div className="min-w-0 text-end">
                  <p
                    className={`font-medium ${
                      compact ? "text-xs" : "text-sm"
                    }`}
                  >
                    {line.label}
                  </p>
                  {line.detail && (
                    <p
                      className={`text-muted ${
                        compact ? "text-[10px]" : "text-xs"
                      }`}
                    >
                      {line.detail}
                    </p>
                  )}
                </div>
                <span
                  className={`shrink-0 font-bold tabular-nums ${
                    line.points > 0
                      ? "text-primary"
                      : line.points < 0
                        ? "text-danger"
                        : "text-muted"
                  } ${compact ? "text-sm" : "text-base"}`}
                >
                  {line.points > 0 ? `+${line.points}` : line.points}
                </span>
              </div>
            ))
          )}
          {lines.length > 0 && (
            <div className="flex items-center justify-between border-t border-card-border/50 pt-2">
              <span
                className={`font-semibold ${
                  compact ? "text-xs" : "text-sm"
                }`}
              >
                {t.pointsBreakdown.total}
              </span>
              <span
                className={`font-bold tabular-nums text-primary ${
                  compact ? "text-base" : "text-lg"
                }`}
              >
                {total}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
