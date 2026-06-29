"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";

type TeamRef = {
  name: string;
};

type FinalistsPredictionSummaryCardProps = {
  deadline: string | null;
  locked: boolean;
  prediction: {
    finalistOneTeam: TeamRef;
    finalistTwoTeam: TeamRef;
    championTeam: TeamRef;
    totalPoints: number;
  } | null;
  pointsTotal: number | null;
};

function formatDeadline(deadline: string | null) {
  if (!deadline) return "لم يحدد بعد";
  return new Intl.DateTimeFormat("ar-SA", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Riyadh",
  }).format(new Date(deadline));
}

function formatCountdown(deadline: string | null, now: number) {
  if (!deadline) return "--:--";
  const diffMs = new Date(deadline).getTime() - now;
  if (diffMs <= 0) return "مغلق";

  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}ي ${hours}س ${minutes}د`;
  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export function FinalistsPredictionSummaryCard({
  deadline,
  locked,
  prediction,
  pointsTotal,
}: FinalistsPredictionSummaryCardProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const hasPrediction = prediction != null;

  return (
    <Card className="border-primary/25 bg-primary/5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-primary">
              توقع النهائي
            </p>
            <span className="rounded-lg border border-primary/35 bg-background/70 px-2.5 py-1 text-xs font-black tabular-nums text-primary">
              {formatCountdown(deadline, now)}
            </span>
          </div>
          {hasPrediction ? (
            <h2 className="mt-2 text-lg font-bold text-foreground">
              {prediction.finalistOneTeam.name} ضد {prediction.finalistTwoTeam.name}
            </h2>
          ) : (
            <h2 className="mt-2 text-lg font-bold text-foreground">
              اختر طرفي النهائي والبطل قبل إغلاق التوقع
            </h2>
          )}
          <p className="mt-1 text-sm text-muted">
            {hasPrediction
              ? `البطل: ${prediction.championTeam.name} · الديدلاين ${formatDeadline(deadline)}`
              : `كل طرف نهائي صحيح +3، والبطل الصحيح +10. الديدلاين ${formatDeadline(deadline)}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {hasPrediction && (
            <div className="text-end">
              <p className="text-xs text-muted">نقاط توقع النهائي</p>
              <p className="text-2xl font-black tabular-nums text-primary">
                {pointsTotal ?? prediction.totalPoints}
              </p>
            </div>
          )}
          <Link
            href="/matches"
            className="rounded-lg border border-card-border px-3 py-2 text-sm font-bold text-foreground transition hover:border-primary/50"
          >
            {locked ? "عرض" : hasPrediction ? "تعديل" : "توقع الآن"}
          </Link>
        </div>
      </div>
    </Card>
  );
}
