"use client";

import { useState } from "react";
import type { LeagueMatchPredictionRow } from "@/types";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { Messages } from "@/lib/i18n/ar";

type LeagueTeamInfo = {
  name: string;
  shortName: string;
  logoUrl?: string | null;
};

type LeaguePredictionsListProps = {
  rows: LeagueMatchPredictionRow[];
  homeTeamId: string;
  awayTeamId: string;
  homeTeam: LeagueTeamInfo;
  awayTeam: LeagueTeamInfo;
  homeShortName: string;
  awayShortName: string;
  isKnockout: boolean;
  isFinished: boolean;
  matchStatus: string;
  matchResult?: unknown | null;
  currentUserId?: string;
};

function shortPlayerName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : name;
}

function ScorerChips({
  scorers,
  align = "start",
  vertical = false,
  showResults = false,
}: {
  scorers: LeagueMatchPredictionRow["scorerPredictions"];
  align?: "start" | "end";
  vertical?: boolean;
  showResults?: boolean;
}) {
  if (!scorers || scorers.length === 0) {
    return <span className="text-xs text-muted/60">—</span>;
  }

  if (vertical) {
    return (
      <ul className={`flex flex-col gap-1 ${align === "end" ? "items-end" : "items-start"}`}>
        {scorers.map((s) => (
          <li key={s.player.id} className="text-sm">
            <span className="font-medium">{shortPlayerName(s.player.name)}</span>
            {s.predictedGoals > 1 && <span className="ml-1">×{s.predictedGoals}</span>}
            {showResults && s.points != null && <span className="ml-2">{s.points > 0 ? `+${s.points}` : s.points}</span>}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {scorers.map((s) => (
        <span key={s.player.id} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] bg-card-border/30">
          {shortPlayerName(s.player.name)}{s.predictedGoals > 1 ? `×${s.predictedGoals}` : null}
        </span>
      ))}
    </div>
  );
}

export function LeaguePredictionsList({
  rows,
  homeTeam,
  awayTeam,
  homeTeamId,
  awayTeamId,
  currentUserId,
}: LeaguePredictionsListProps) {
  const { messages: t } = useI18n();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (!rows || rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-card-border bg-card/40 px-6 py-12 text-center">
        <p className="text-3xl opacity-40" aria-hidden>
          📋
        </p>
        <p className="mt-3 text-sm text-muted">{t.matches?.noLeaguePredictions ?? "No predictions"}</p>
      </div>
    );
  }

  return (
    <div className="w-full rounded-xl border border-card-border bg-card/80">
      <div className="border-b border-card-border px-3 py-2.5 flex items-center justify-between">
        <div className="text-xs font-medium uppercase text-muted">{t.matches?.scoreboardPlayer ?? "Player"}</div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <TeamLogo {...homeTeam} size="sm" />
            <span className="text-sm font-medium">{homeTeam.shortName}</span>
          </div>
          <div className="text-sm font-bold">-</div>
          <div className="flex items-center gap-1">
            <TeamLogo {...awayTeam} size="sm" />
            <span className="text-sm font-medium">{awayTeam.shortName}</span>
          </div>
        </div>
      </div>

      <ul className="divide-y divide-card-border/80">
        {rows.map((row, idx) => (
          <li key={row.userId} className="px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="font-semibold">{row.username}</span>
                {row.userId === currentUserId && <span className="text-xs text-primary">{t.matches?.you ?? "you"}</span>}
              </div>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold tabular-nums">{row.prediction?.predHome != null ? row.prediction.predHome : "—"}</div>
                </div>
                <div className="text-2xl font-bold">-</div>
                <div className="text-center">
                  <div className="text-2xl font-bold tabular-nums">{row.prediction?.predAway != null ? row.prediction.predAway : "—"}</div>
                </div>
                <button onClick={() => setOpenIndex(openIndex === idx ? null : idx)} className="ml-4 text-xs text-muted">{openIndex === idx ? (t.pointsBreakdown?.hideDetails ?? 'Hide') : (t.matches?.tapForDetails ?? 'Details')}</button>
              </div>
            </div>

            {openIndex === idx && (
              <div className="mt-3">
                <div className="text-xs text-muted mb-2">{t.matches?.scorers ?? 'Scorers'}</div>
                <div className="grid grid-cols-2 gap-3">
                  <ScorerChips scorers={row.scorerPredictions.filter((p) => p.player.teamId === homeTeamId)} vertical />
                  <ScorerChips scorers={row.scorerPredictions.filter((p) => p.player.teamId === awayTeamId)} vertical align="end" />
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
