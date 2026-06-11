"use client";

import type { PointsBreakdownLine } from "@/lib/match-points-breakdown";
import { useI18n } from "@/lib/i18n/LocaleProvider";

type PointsBreakdownLinesProps = {
  lines: PointsBreakdownLine[];
  total: number;
  compact?: boolean;
  showTotal?: boolean;
  className?: string;
};

function statusIcon(correct: boolean | undefined) {
  if (correct === true) {
    return (
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary"
        aria-label="correct"
      >
        ✓
      </span>
    );
  }
  if (correct === false) {
    return (
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-danger/15 text-xs font-bold text-danger"
        aria-label="incorrect"
      >
        ✗
      </span>
    );
  }
  return <span className="w-5 shrink-0" aria-hidden />;
}

function formatPoints(points: number) {
  if (points > 0) return `+${points}`;
  return String(points);
}

export function PointsBreakdownLines({
  lines,
  total,
  compact = false,
  showTotal = true,
  className = "",
}: PointsBreakdownLinesProps) {
  const { messages: t } = useI18n();

  if (lines.length === 0) {
    return (
      <p className={`text-muted ${compact ? "text-xs" : "text-sm"} ${className}`}>
        {t.matches.noPointsEarned}
      </p>
    );
  }

  return (
    <div className={className}>
      <ul className={`space-y-2 ${compact ? "text-xs" : "text-sm"}`}>
        {lines.map((line) => (
          <li
            key={line.id}
            className="flex items-start justify-between gap-2 border-b border-card-border/40 pb-2 last:border-0 last:pb-0"
          >
            <div className="flex min-w-0 items-start gap-2 text-end">
              {statusIcon(line.correct)}
              <div className="min-w-0">
                <p className="font-medium">{line.label}</p>
                {line.detail && (
                  <p
                    className={`text-muted ${compact ? "text-[10px]" : "text-xs"}`}
                  >
                    {line.detail}
                  </p>
                )}
              </div>
            </div>
            <span
              className={`shrink-0 font-bold tabular-nums ${
                line.points > 0
                  ? "text-primary"
                  : line.points < 0
                    ? "text-danger"
                    : "text-muted"
              } ${compact ? "text-xs" : "text-sm"}`}
            >
              {formatPoints(line.points)}
            </span>
          </li>
        ))}
      </ul>
      {showTotal && (
        <div className="mt-2 flex items-center justify-between border-t border-card-border/50 pt-2">
          <span className={`font-semibold ${compact ? "text-xs" : "text-sm"}`}>
            {t.pointsBreakdown.total}
          </span>
          <span
            className={`font-bold tabular-nums ${
              total > 0
                ? "text-primary"
                : total < 0
                  ? "text-danger"
                  : "text-muted"
            } ${compact ? "text-sm" : "text-base"}`}
          >
            {formatPoints(total)}
          </span>
        </div>
      )}
    </div>
  );
}
