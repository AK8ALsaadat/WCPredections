"use client";

import { useEffect, useState } from "react";
import {
  formatCountdownAr,
  getPredictionCountdownTarget,
} from "@/lib/utils";
import { ar } from "@/lib/i18n/ar";

type PredictionCountdownProps = {
  matchTime: string | Date;
  className?: string;
  variant?: "compact" | "prominent";
};

type Urgency = "calm" | "warning" | "critical" | "opens";

function getUrgency(kind: "closes" | "opens", remainingMs: number): Urgency {
  if (kind === "opens") return "opens";

  const hours = remainingMs / (60 * 60 * 1000);
  if (hours < 1) return "critical";
  if (hours < 6) return "warning";
  return "calm";
}

const urgencyStyles: Record<
  Urgency,
  { box: string; label: string; timer: string; pulse?: boolean }
> = {
  calm: {
    box: "border-primary/40 bg-primary/10",
    label: "text-muted",
    timer: "text-primary",
  },
  warning: {
    box: "border-warning/55 bg-warning/12",
    label: "text-warning/80",
    timer: "text-warning",
  },
  critical: {
    box: "border-danger/60 bg-danger/15 shadow-[0_0_20px_rgba(239,68,68,0.15)]",
    label: "text-danger/80",
    timer: "text-danger",
    pulse: true,
  },
  opens: {
    box: "border-card-border bg-card/60",
    label: "text-muted",
    timer: "text-muted",
  },
};

export function PredictionCountdown({
  matchTime,
  className = "",
  variant = "compact",
}: PredictionCountdownProps) {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [target, setTarget] = useState(
    () => getPredictionCountdownTarget(matchTime)
  );

  useEffect(() => {
    function tick() {
      const nextTarget = getPredictionCountdownTarget(matchTime);
      setTarget(nextTarget);

      if (!nextTarget) {
        setRemainingMs(null);
        return;
      }

      setRemainingMs(Math.max(0, nextTarget.at.getTime() - Date.now()));
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [matchTime]);

  if (!target || remainingMs === null) {
    return null;
  }

  const urgency = getUrgency(target.kind, remainingMs);
  const styles = urgencyStyles[urgency];
  const label =
    target.kind === "closes"
      ? ar.matches.countdownCloses
      : ar.matches.countdownOpens;

  const isProminent = variant === "prominent";

  return (
    <div
      className={`rounded-xl border text-center transition-colors duration-500 ${
        styles.box
      } ${styles.pulse ? "animate-pulse" : ""} ${
        isProminent ? "px-5 py-4" : "px-3 py-2.5"
      } ${className}`}
    >
      <p className={`font-medium ${styles.label} ${isProminent ? "text-sm" : "text-xs"}`}>
        {label}
      </p>
      <p
        className={`font-mono font-bold tracking-wide ${styles.timer} ${
          isProminent ? "mt-1.5 text-2xl sm:text-3xl" : "mt-1 text-sm"
        }`}
        dir="ltr"
      >
        {formatCountdownAr(remainingMs)}
      </p>
    </div>
  );
}
