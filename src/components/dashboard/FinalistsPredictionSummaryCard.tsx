"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";

type TeamRef = {
  name: string;
  shortName?: string | null;
  logoUrl?: string | null;
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

function ChampionCrownIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="m3 7 4.4 3.4L12 4l4.6 6.4L21 7l-1.5 10.5h-15L3 7Z"
        fill="currentColor"
      />
      <path
        d="M5 20h14"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function ChampionBadge({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-lg border border-amber-300/60 bg-gradient-to-l from-amber-500/20 via-yellow-300/15 to-card px-3 py-1.5 text-sm font-black text-amber-100 shadow-[0_0_18px_rgba(245,158,11,0.18)]">
      <ChampionCrownIcon className="h-4 w-4 text-amber-200" />
      <span className="text-amber-200">البطل المتوقع</span>
      <span className="text-foreground">{name}</span>
    </span>
  );
}

function TeamLogo({
  team,
  className = "h-14 w-14",
}: {
  team: TeamRef | null;
  className?: string;
}) {
  const label = team?.shortName || team?.name?.slice(0, 3) || "--";

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-background/70 text-xs font-black text-muted shadow-inner ${className}`}
    >
      {team?.logoUrl ? (
        <img
          src={team.logoUrl}
          alt={team.name}
          className="h-full w-full object-contain p-1.5"
        />
      ) : (
        <span>{label}</span>
      )}
    </span>
  );
}

function FinalistPanel({ team }: { team: TeamRef }) {
  return (
    <div className="rounded-lg border border-white/10 bg-background/45 px-3 py-3 text-end">
      <p className="text-[10px] font-bold text-muted">طرف النهائي</p>
      <div className="mt-2 flex items-center justify-end gap-3">
        <p className="min-w-0 truncate text-base font-black text-foreground">
          {team.name}
        </p>
        <TeamLogo team={team} />
      </div>
    </div>
  );
}

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
    <Card className="overflow-hidden border-amber-300/30 bg-gradient-to-l from-amber-500/10 via-card to-card shadow-[0_18px_55px_rgba(0,0,0,0.25)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="rounded-lg border border-amber-300/45 bg-background/70 px-3 py-1.5 text-xs font-black tabular-nums text-amber-200 shadow-inner">
              {formatCountdown(deadline, now)}
            </span>
            <p className="text-xs font-black uppercase tracking-wide text-amber-200">
              توقع النهائي
            </p>
          </div>
          {hasPrediction ? (
            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
              <FinalistPanel team={prediction.finalistOneTeam} />
              <span className="mx-auto hidden rounded-lg border border-card-border bg-background/60 px-3 py-2 text-xs font-black text-muted md:block">
                VS
              </span>
              <FinalistPanel team={prediction.finalistTwoTeam} />
            </div>
          ) : (
            <div className="mt-3 rounded-lg border border-white/10 bg-background/45 px-4 py-4 text-end">
              <h2 className="text-lg font-black text-foreground">
                اختر طرفي النهائي والبطل
              </h2>
              <p className="mt-1 text-sm text-muted">
                الديدلاين {formatDeadline(deadline)}
              </p>
            </div>
          )}
          {hasPrediction && (
            <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
              <ChampionBadge name={prediction.championTeam.name} />
              <TeamLogo team={prediction.championTeam} className="h-16 w-16" />
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {hasPrediction && (
            <div className="text-end">
              <p className="text-xs text-muted">نقاط توقع النهائي</p>
              <p className="text-2xl font-black tabular-nums text-primary">
                {pointsTotal ?? prediction.totalPoints}
              </p>
            </div>
          )}
          {locked && hasPrediction && (
            <Link
              href="/finalists-predictions"
              className="rounded-lg bg-primary px-3 py-2 text-sm font-bold text-white transition hover:bg-primary-hover"
            >
              شف توقعات الدوري
            </Link>
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
