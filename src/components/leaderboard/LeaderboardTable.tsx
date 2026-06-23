"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { LeaderboardEntry } from "@/types";
import { Card } from "@/components/ui/Card";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { clientFetch } from "@/lib/client-fetch";
import { getRelegationStatus } from "@/lib/leaderboard-relegation";

function CrownIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="m3 7 4.2 3.2L12 4l4.8 6.2L21 7l-1.5 10h-15L3 7Z"
        fill="currentColor"
      />
      <path
        d="M5 20h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RankTrend({ change }: { change?: number }) {
  const { messages: t } = useI18n();

  if (change == null || change === 0) {
    return <span className="inline-block text-xs text-muted">-</span>;
  }

  const improved = change > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold ${
        improved ? "text-primary" : "text-danger"
      }`}
      title={improved ? t.leaderboard.rankUp : t.leaderboard.rankDown}
    >
      <span aria-hidden>{improved ? "↑" : "↓"}</span>
      <span>{Math.abs(change)}</span>
    </span>
  );
}

function pointsTone(points: number) {
  if (points > 0) return "text-primary";
  if (points < 0) return "text-danger";
  return "text-muted";
}

function RankBadge({
  rank,
  relegated = false,
  exempt = false,
}: {
  rank: number;
  relegated?: boolean;
  exempt?: boolean;
}) {
  return (
    <span
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-black shadow-inner ${
        exempt
          ? "border border-emerald-200/50 bg-gradient-to-br from-emerald-300/30 via-emerald-500/20 to-emerald-950/60 text-emerald-50 shadow-[0_0_22px_rgba(16,185,129,0.22)]"
          : relegated
          ? "border border-red-300/40 bg-gradient-to-br from-red-400/25 to-red-950/50 text-red-100 shadow-[0_0_18px_rgba(239,68,68,0.14)]"
          : rank === 2
            ? "border border-slate-200/30 bg-gradient-to-br from-slate-200/20 to-slate-500/10 text-slate-100"
            : rank === 3
              ? "border border-orange-300/30 bg-gradient-to-br from-orange-300/20 to-orange-700/10 text-orange-300"
              : "border border-card-border bg-background/50 text-muted"
      }`}
    >
      {rank}
    </span>
  );
}

function AdministrationExemptionTag() {
  const { messages: t } = useI18n();

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/50 bg-emerald-400/15 px-2.5 py-1 text-[10px] font-black text-emerald-100 shadow-[0_0_18px_rgba(16,185,129,0.2)]">
      <span
        className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_9px_rgba(110,231,183,1)]"
        aria-hidden
      />
      {t.leaderboard.administrationExemption}
    </span>
  );
}

function RelegationTag() {
  const { messages: t } = useI18n();

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-red-300/40 bg-red-500/15 px-2.5 py-1 text-[10px] font-black text-red-100 shadow-[0_0_16px_rgba(239,68,68,0.14)]">
      <span
        className="h-1.5 w-1.5 rounded-full bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.9)]"
        aria-hidden
      />
      {t.leaderboard.relegated}
    </span>
  );
}

function LeaderTag() {
  const { messages: t } = useI18n();

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/50 bg-amber-300/15 px-2.5 py-1 text-[10px] font-black text-amber-200 shadow-[0_0_18px_rgba(245,158,11,0.15)]">
      <CrownIcon className="h-3.5 w-3.5" />
      {t.leaderboard.leaderTag}
    </span>
  );
}

function FireStreakTag({ days }: { days: number }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-amber-300/40 bg-gradient-to-br from-amber-400/10 to-red-900/5 px-3 py-1 text-[12px] font-extrabold text-amber-50 shadow-[0_0_18px_rgba(245,158,11,0.12)]"
      role="status"
      aria-label={`Streak ${days} days`}
    >
      <span aria-hidden className="text-base leading-none">🔥</span>
      <span className="ml-0.5">{days}</span>
    </span>
  );
}

function NightChampionTag({ points }: { points?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-300/60 bg-orange-500/20 px-2.5 py-1 text-[10px] font-black text-orange-100 shadow-[0_0_22px_rgba(249,115,22,0.25)]">
      <span
        className="inline-flex h-4 w-4 items-center justify-center rounded-[5px] bg-gradient-to-br from-yellow-200 via-orange-400 to-red-600 text-[10px] shadow-[0_0_14px_rgba(249,115,22,0.65)]"
        aria-hidden
      >
        F
      </span>
      Night king
      {points && points > 0 ? (
        <span className="text-orange-200/80">+{points}</span>
      ) : null}
    </span>
  );
}

function LeaderSpotlight({
  entry,
  highlightUserId,
  showRankTrend,
  pointsLabel,
}: {
  entry: LeaderboardEntry;
  highlightUserId?: string;
  showRankTrend?: boolean;
  pointsLabel?: string;
}) {
  const { messages: t } = useI18n();
  const isMe = entry.userId === highlightUserId;
  const isNightChampion = entry.isNightChampion;

  return (
    <Link
      href={`/user/${encodeURIComponent(entry.username)}`}
      className={`group relative block overflow-hidden rounded-2xl border p-[1px] shadow-[0_20px_60px_rgba(0,0,0,0.4)] transition-transform hover:-translate-y-0.5 ${
        isNightChampion
          ? "border-orange-300/80"
          : isMe ? "border-primary/70" : "border-amber-300/60"
      }`}
    >
      <div
        className={`absolute inset-0 ${
          isNightChampion
            ? "bg-gradient-to-r from-red-600/65 via-orange-300/40 to-yellow-400/55"
            : "bg-gradient-to-r from-amber-500/60 via-yellow-200/30 to-amber-600/60"
        }`}
      />
      <div
        className={`relative overflow-hidden rounded-[15px] px-4 py-5 sm:px-7 sm:py-6 ${
          isNightChampion
            ? "bg-gradient-to-br from-[#3a0b05] via-[#241007] to-[#101722]"
            : "bg-gradient-to-br from-[#302307] via-[#191912] to-[#101722]"
        }`}
      >
        <div className="pointer-events-none absolute -start-12 -top-16 h-44 w-44 rounded-full bg-amber-300/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 end-0 h-48 w-48 rounded-full bg-warning/10 blur-3xl" />
        {isNightChampion && (
          <>
            <div className="leaderboard-fire-aura pointer-events-none absolute -end-10 -top-16 h-56 w-56 rounded-full bg-orange-500/25 blur-3xl" />
            <div className="leaderboard-fire-flicker pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-orange-300 to-transparent" />
          </>
        )}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/80 to-transparent" />

        <div className="relative flex items-center gap-4 sm:gap-6">
          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-amber-100/60 bg-gradient-to-br from-yellow-100 via-amber-400 to-amber-600 text-[#2b1900] shadow-[0_0_35px_rgba(245,158,11,0.4)] sm:h-20 sm:w-20">
            <CrownIcon className="h-9 w-9 sm:h-11 sm:w-11" />
            <span className="absolute -bottom-2 rounded-full border border-amber-200/60 bg-[#241803] px-2.5 py-0.5 text-xs font-black text-amber-100">
              #1
            </span>
          </div>

          <div className="min-w-0 flex-1 text-end">
            <div className="flex flex-wrap items-center justify-end gap-2">
              {isNightChampion && (
                <NightChampionTag points={entry.nightWindowPoints} />
              )}
              <LeaderTag />
              {entry.streakDays && entry.streakDays >= 3 ? (
                <FireStreakTag days={entry.streakDays} />
              ) : null}
              {isMe && (
                <span className="rounded-full bg-primary/15 px-2 py-1 text-[10px] font-bold text-primary ring-1 ring-primary/30">
                  {t.matches.you}
                </span>
              )}
            </div>
            <p className="mt-2 truncate text-xl font-black text-amber-50 sm:text-2xl">
              {entry.username}
            </p>
            {showRankTrend && (
              <div className="mt-1">
                <RankTrend change={entry.rankChange} />
              </div>
            )}
          </div>

          <div className="shrink-0 border-s border-amber-100/20 ps-4 text-start sm:ps-7">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-100/60">
              {pointsLabel ?? t.leaderboard.points}
            </p>
            <p className="mt-1 text-3xl font-black tabular-nums text-amber-300 sm:text-4xl">
              {entry.points}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}

function MobileLeaderboardList({
  entries,
  highlightUserId,
  showRankTrend,
  pointsLabel,
  relegatedUserIds,
  exemptUserIds,
}: {
  entries: LeaderboardEntry[];
  highlightUserId?: string;
  showRankTrend?: boolean;
  pointsLabel?: string;
  relegatedUserIds: Set<string>;
  exemptUserIds: Set<string>;
}) {
  const { messages: t } = useI18n();

  return (
    <div className="space-y-2 md:hidden">
      {entries.map((entry) => {
        const isRelegated = relegatedUserIds.has(entry.userId);
        const isExempt = exemptUserIds.has(entry.userId);
        const isMe = entry.userId === highlightUserId;
        const isNightChampion = entry.isNightChampion;

        return (
          <Link
            key={entry.userId}
            href={`/user/${encodeURIComponent(entry.username)}`}
            className={`relative flex items-center gap-3 overflow-hidden rounded-xl border px-3 py-3 shadow-sm transition-colors ${
              isExempt
                ? `border-emerald-300/55 bg-gradient-to-l from-emerald-950/80 via-emerald-900/45 to-card shadow-[0_10px_32px_rgba(5,150,105,0.18)] hover:border-emerald-200/70 ${
                    isMe ? "ring-1 ring-primary/60" : ""
                  }`
                : isNightChampion
                ? `border-orange-300/55 bg-gradient-to-l from-red-950/80 via-orange-900/35 to-card shadow-[0_10px_32px_rgba(249,115,22,0.18)] hover:border-orange-200/70 ${
                    isMe ? "ring-1 ring-primary/60" : ""
                  }`
                : isRelegated
                ? `border-red-400/45 bg-gradient-to-l from-red-950/75 via-red-950/35 to-card hover:border-red-300/60 ${
                    isMe ? "ring-1 ring-primary/60" : ""
                  }`
                : isMe
                  ? "border-primary/40 bg-primary/10"
                  : entry.rank === 2
                    ? "border-slate-300/30 bg-gradient-to-l from-slate-300/[0.08] to-card"
                    : entry.rank === 3
                      ? "border-orange-400/30 bg-gradient-to-l from-orange-400/[0.07] to-card"
                      : "border-card-border bg-card"
            }`}
          >
            {(isRelegated || isExempt) && (
              <span
                className={`absolute inset-y-0 end-0 w-1 ${
                  isExempt
                    ? "bg-gradient-to-b from-emerald-200 via-emerald-400 to-emerald-900"
                    : "bg-gradient-to-b from-red-300 via-red-500 to-red-900"
                }`}
              />
            )}
            <div className="min-w-0 flex-1 text-end">
              <div className="flex min-w-0 items-center justify-end gap-2">
                {isNightChampion && (
                  <NightChampionTag points={entry.nightWindowPoints} />
                )}
                {isExempt ? (
                  <AdministrationExemptionTag />
                ) : isRelegated ? (
                  <RelegationTag />
                ) : null}
                <span className="truncate font-semibold">{entry.username}</span>
                <RankBadge
                  rank={entry.rank}
                  relegated={isRelegated}
                  exempt={isExempt}
                />
              </div>
              {showRankTrend && (
                <div className="mt-0.5">
                  <RankTrend change={entry.rankChange} />
                </div>
              )}
            </div>
            <div className="shrink-0 text-start">
              <p
                className={`text-[10px] ${
                  isExempt
                    ? "text-emerald-100/70"
                    : isNightChampion
                      ? "text-orange-100/75"
                    : isRelegated
                      ? "text-red-200/70"
                      : "text-muted"
                }`}
              >
                {pointsLabel ?? t.leaderboard.points}
              </p>
              <p
                className={`text-lg font-black tabular-nums ${
                  isExempt
                    ? "text-emerald-200"
                    : isNightChampion
                      ? "text-orange-200"
                    : isRelegated
                      ? "text-red-200"
                      : pointsTone(entry.points)
                }`}
              >
                {entry.points}
              </p>
            </div>
          </Link>
        );
      })}
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
  showRelegationZone = false,
}: {
  entries: LeaderboardEntry[];
  highlightUserId?: string;
  showRankTrend?: boolean;
  pointsLabel?: string;
  realtimeEndpoint?: string;
  showRelegationZone?: boolean;
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
  const { messages: t } = useI18n();
  const [liveEntries, setLiveEntries] = useState(entries);
  const refreshInFlight = useRef(false);

  useEffect(() => {
    setLiveEntries(entries);
  }, [entries]);

  useEffect(() => {
    if (!realtimeEndpoint) return;

    const refresh = async () => {
      if (refreshInFlight.current || document.visibilityState !== "visible") {
        return;
      }
      refreshInFlight.current = true;
      try {
        const response = await clientFetch(realtimeEndpoint, {
          cache: "no-store",
        });
        const payload = response ? await response.json() : null;
        if (payload?.success && Array.isArray(payload.data)) {
          setLiveEntries(payload.data);
        }
      } finally {
        refreshInFlight.current = false;
      }
    };

    const events = new EventSource("/api/events");
    const onScoringUpdate = () => void refresh();
    events.addEventListener("match-scoring-updated", onScoringUpdate);
    const timer = setInterval(() => void refresh(), 30_000);

    return () => {
      clearInterval(timer);
      events.removeEventListener("match-scoring-updated", onScoringUpdate);
      events.close();
    };
  }, [realtimeEndpoint]);

  const L = labels ?? {
    rank: t.leaderboard.rank,
    trend: t.leaderboard.trend,
    username: t.leaderboard.username,
    points: t.leaderboard.points,
    empty: t.leaderboard.empty,
    rankUp: t.leaderboard.rankUp,
    rankDown: t.leaderboard.rankDown,
  };

  if (liveEntries.length === 0) {
    return (
      <Card>
        <p className="py-6 text-center text-sm text-muted">{L.empty}</p>
      </Card>
    );
  }

  const leader = liveEntries[0];
  const remainingEntries = liveEntries.slice(1);
  const { relegatedUserIds, exemptUserIds } = getRelegationStatus(
    liveEntries,
    showRelegationZone
  );

  return (
    <div className="space-y-4">
      <LeaderSpotlight
        entry={leader}
        highlightUserId={highlightUserId}
        showRankTrend={showRankTrend}
        pointsLabel={pointsLabel}
      />

      <MobileLeaderboardList
        entries={remainingEntries}
        highlightUserId={highlightUserId}
        showRankTrend={showRankTrend}
        pointsLabel={pointsLabel}
        relegatedUserIds={relegatedUserIds}
        exemptUserIds={exemptUserIds}
      />

      {remainingEntries.length > 0 && (
        <Card className="hidden overflow-hidden border-card-border/80 bg-card/80 p-0 md:block">
          <table className="w-full">
            <thead>
              <tr className="border-b border-card-border bg-background/70">
                {showRankTrend && (
                  <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted">
                    {L.trend}
                  </th>
                )}
                <th className="px-5 py-3 text-end text-xs font-semibold uppercase tracking-wider text-muted">
                  {L.username}
                </th>
                <th className="px-5 py-3 text-start text-xs font-semibold uppercase tracking-wider text-muted">
                  {pointsLabel ?? L.points}
                </th>
              </tr>
            </thead>
            <tbody>
              {remainingEntries.map((entry) => {
                const isRelegated = relegatedUserIds.has(entry.userId);
                const isExempt = exemptUserIds.has(entry.userId);
                const isMe = entry.userId === highlightUserId;
                const isNightChampion = entry.isNightChampion;

                return (
                  <tr
                    key={entry.userId}
                    className={`border-b transition-colors ${
                      isExempt
                        ? `border-emerald-300/25 bg-gradient-to-l from-emerald-950/80 via-emerald-900/35 to-transparent shadow-[inset_4px_0_0_rgba(52,211,153,0.75)] hover:from-emerald-900/80 ${
                            isMe ? "outline outline-1 -outline-offset-1 outline-primary/60" : ""
                          }`
                        : isNightChampion
                        ? `border-orange-300/30 bg-gradient-to-l from-red-950/65 via-orange-950/30 to-transparent shadow-[inset_4px_0_0_rgba(249,115,22,0.75)] hover:from-orange-900/55 ${
                            isMe ? "outline outline-1 -outline-offset-1 outline-primary/60" : ""
                          }`
                        : isRelegated
                        ? `border-red-400/20 bg-gradient-to-l from-red-950/70 via-red-950/25 to-transparent hover:from-red-900/70 ${
                            isMe ? "outline outline-1 -outline-offset-1 outline-primary/60" : ""
                          }`
                        : isMe
                          ? "border-card-border/40 bg-primary/10"
                          : entry.rank === 2
                            ? "border-card-border/40 bg-slate-300/[0.04] hover:bg-slate-300/[0.08]"
                            : entry.rank === 3
                              ? "border-card-border/40 bg-orange-400/[0.035] hover:bg-orange-400/[0.075]"
                              : "border-card-border/40 hover:bg-card-border/15"
                    }`}
                  >
                    {showRankTrend && (
                      <td className="px-3 py-3 text-center">
                        <RankTrend change={entry.rankChange} />
                      </td>
                    )}
                    <td className="px-5 py-3 font-medium">
                      <div className="flex items-center justify-end gap-3">
                        {isNightChampion && (
                          <NightChampionTag points={entry.nightWindowPoints} />
                        )}
                        {isExempt ? (
                          <AdministrationExemptionTag />
                        ) : isRelegated ? (
                          <RelegationTag />
                        ) : null}
                        <Link
                          href={`/user/${encodeURIComponent(entry.username)}`}
                          className="font-semibold text-foreground transition-colors hover:text-primary"
                        >
                          {entry.username}
                        </Link>
                        <RankBadge
                          rank={entry.rank}
                          relegated={isRelegated}
                          exempt={isExempt}
                        />
                      </div>
                    </td>
                    <td
                      className={`px-5 py-3 text-start text-lg font-black tabular-nums ${
                      isExempt
                        ? "text-emerald-200"
                          : isNightChampion
                            ? "text-orange-200"
                        : isRelegated
                            ? "text-red-200"
                            : pointsTone(entry.points)
                      }`}
                    >
                      {entry.points}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
