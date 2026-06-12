"use client";

import { useEffect, useState } from "react";
import type { LeaderboardEntry } from "@/types";
import { Card } from "@/components/ui/Card";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { clientFetch } from "@/lib/client-fetch";

function RankTrend({ change }: { change?: number }) {
  const { messages: t } = useI18n();

  if (change == null || change === 0) {
    return <span className="inline-block text-xs text-muted">—</span>;
  }

  if (change > 0) {
    return (
      <span
        className="inline-flex items-center gap-0.5 text-xs font-semibold text-primary"
        title={t.leaderboard.rankUp}
      >
        <span aria-hidden>▲</span>
        <span>{change}</span>
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-0.5 text-xs font-semibold text-danger"
      title={t.leaderboard.rankDown}
    >
      <span aria-hidden>▼</span>
      <span>{Math.abs(change)}</span>
    </span>
  );
}

function pointsTone(points: number) {
  if (points > 0) return "text-primary";
  if (points < 0) return "text-danger";
  return "text-muted";
}

function RankBadge({ rank }: { rank: number }) {
  return (
    <span
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
        rank === 1
          ? "bg-warning/20 text-warning ring-1 ring-warning/30"
          : rank === 2
            ? "bg-slate-400/15 text-foreground ring-1 ring-slate-400/20"
            : rank === 3
              ? "bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/25"
              : "bg-card-border/60 text-muted"
      }`}
    >
      {rank}
    </span>
  );
}

function MobileLeaderboardList({
  entries,
  highlightUserId,
  showRankTrend,
  pointsLabel,
}: {
  entries: LeaderboardEntry[];
  highlightUserId?: string;
  showRankTrend?: boolean;
  pointsLabel?: string;
}) {
  const { messages: t } = useI18n();

  return (
    <div className="space-y-2 md:hidden">
      {entries.map((entry) => (
        <a
          key={entry.userId}
          href={`/user/${encodeURIComponent(entry.username)}`}
          className={`flex items-center gap-3 rounded-xl border px-3 py-3 ${
            entry.userId === highlightUserId
              ? "border-primary/40 bg-primary/10"
              : "border-card-border bg-card"
          }`}
        >
          <RankBadge rank={entry.rank} />
          <div className="min-w-0 flex-1 text-end">
            <p className="truncate font-medium">{entry.username}</p>
            {showRankTrend && (
              <div className="mt-0.5">
                <RankTrend change={entry.rankChange} />
              </div>
            )}
          </div>
          <div className="shrink-0 text-start">
            <p className="text-[10px] text-muted">
              {pointsLabel ?? t.leaderboard.points}
            </p>
            <p className={`text-lg font-bold tabular-nums ${pointsTone(entry.points)}`}>
              {entry.points}
            </p>
          </div>
        </a>
      ))}
    </div>
  );
}

export function LeaderboardTable({
  entries,
  highlightUserId,
  showRankTrend = false,
  pointsLabel,
  labels,
  realtimeEndpoint,
}: {
  entries: LeaderboardEntry[];
  highlightUserId?: string;
  showRankTrend?: boolean;
  pointsLabel?: string;
  realtimeEndpoint?: string;
  labels?: {
    rank: string;
    trend: string;
    username: string;
    points: string;
    empty: string;
    rankUp: string;
    rankDown: string;
  };
}) {
  const i18nCtx = useI18n();
  const t = i18nCtx.messages;
  const [liveEntries, setLiveEntries] = useState(entries);

  useEffect(() => {
    setLiveEntries(entries);
  }, [entries]);

  useEffect(() => {
    if (!realtimeEndpoint) return;

    const refresh = async () => {
      const response = await clientFetch(realtimeEndpoint, { cache: "no-store" });
      const payload = response ? await response.json() : null;
      if (payload?.success && Array.isArray(payload.data)) {
        setLiveEntries(payload.data);
      }
    };

    const timer = setInterval(() => {
      void refresh();
    }, 5_000);
    return () => clearInterval(timer);
  }, [realtimeEndpoint]);
  const L = labels ?? {
    rank: t.leaderboard.rank,
    trend: t.leaderboard.trend,
    username: t.leaderboard.username,
    points: t.leaderboard.points,
    empty: t.leaderboard.empty,
    rankUp: t.leaderboard.rankUp,
    rankDown: t.leaderboard.rankDown,
  } as const;

  if (liveEntries.length === 0) {
    return (
      <Card>
        <p className="py-6 text-center text-sm text-muted">
          {t.leaderboard.empty}
        </p>
      </Card>
    );
  }

  return (
    <>
          <MobileLeaderboardList
        entries={liveEntries}
        highlightUserId={highlightUserId}
        showRankTrend={showRankTrend}
        pointsLabel={pointsLabel}
      />

      <Card className="hidden overflow-hidden p-0 md:block">
        <table className="w-full">
          <thead>
            <tr className="border-b border-card-border bg-background/60">
              <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-muted">
                {L.rank}
              </th>
              {showRankTrend && (
                <th className="px-2 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted">
                  {L.trend}
                </th>
              )}
                <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-muted">
                {L.username}
              </th>
              <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-muted">
                {pointsLabel ?? L.points}
              </th>
            </tr>
          </thead>
          <tbody>
              {liveEntries.map((entry) => (
              <tr
                key={entry.userId}
                className={`border-b border-card-border/40 transition-colors ${
                  entry.userId === highlightUserId
                    ? "bg-primary/10"
                    : "hover:bg-card-border/15"
                }`}
              >
                <td className="px-4 py-3">
                  <RankBadge rank={entry.rank} />
                </td>
                {showRankTrend && (
                  <td className="px-2 py-3 text-center">
                    <RankTrend change={entry.rankChange} />
                  </td>
                )}
                <td className="px-4 py-3 font-medium">{
                  /* link to public user page */
                }<a href={`/user/${encodeURIComponent(entry.username)}`} className="font-medium text-primary hover:underline">{entry.username}</a></td>
                <td
                  className={`px-4 py-3 text-start text-lg font-bold tabular-nums ${pointsTone(entry.points)}`}
                >
                  {entry.points}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
