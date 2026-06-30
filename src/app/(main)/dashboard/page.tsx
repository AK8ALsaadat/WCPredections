import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import {
  getDashboardData,
  statsFromLeaderboard,
} from "@/services/leaderboard.service";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";
import { Card } from "@/components/ui/Card";
import { getServerI18n } from "@/lib/i18n/server";
import type { Messages } from "@/lib/i18n/ar";
import { getTournamentRoundName } from "@/lib/rounds";
import { getKnockoutBracketPredictionStatus } from "@/services/knockout-bracket-prediction.service";
import { FinalistsPredictionSummaryCard } from "@/components/dashboard/FinalistsPredictionSummaryCard";

function RankStatCard({
  href,
  label,
  rank,
  rankChange,
  fullLeaderboardLabel,
}: {
  href: string;
  label: string;
  rank: number | string;
  rankChange?: number;
  fullLeaderboardLabel: string;
}) {
  return (
    <Link href={href} className="group block">
      <Card className="transition-colors hover:border-primary/50 hover:bg-primary/5">
        <p className="text-sm text-muted group-hover:text-foreground">{label}</p>
        <div className="mt-1 flex items-center gap-2">
          <p className="text-3xl font-bold tabular-nums">{rank}</p>
          {rankChange != null && rankChange !== 0 && (
            <span
              className={`text-sm font-semibold ${
                rankChange > 0 ? "text-primary" : "text-danger"
              }`}
            >
              {rankChange > 0 ? "▲" : "▼"}
              {Math.abs(rankChange)}
            </span>
          )}
        </div>
        <p className="mt-2 text-xs text-primary md:opacity-0 md:transition-opacity md:group-hover:opacity-100">
          {fullLeaderboardLabel} ←
        </p>
      </Card>
    </Link>
  );
}

function StatPill({
  label,
  value,
  tone = "neutral",
  footer,
}: {
  label: string;
  value: number | string;
  tone?: "primary" | "warning" | "neutral";
  footer?: string;
}) {
  const valueClass =
    tone === "primary"
      ? "text-primary"
      : tone === "warning"
        ? typeof value === "number" && value < 0
          ? "text-danger"
          : typeof value === "number" && value > 0
            ? "text-warning"
            : "text-muted"
        : "text-foreground";

  const borderClass =
    tone === "primary"
      ? "border-primary/25 bg-primary/10"
      : tone === "warning"
        ? "border-warning/25 bg-warning/10"
        : "border-card-border bg-background/40";

  return (
    <div
      className={`min-w-[7.5rem] flex-1 rounded-xl border px-3 py-3 text-center sm:min-w-[8.5rem] sm:px-4 ${borderClass}`}
    >
      <p className="text-[11px] leading-tight text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${valueClass}`}>
        {value}
      </p>
      {footer && (
        <p className="mt-1 text-[10px] text-muted">{footer}</p>
      )}
    </div>
  );
}

function DashboardHeaderStats({
  t,
  tournamentPoints,
  tournamentAverage,
  participantCount,
}: {
  t: Messages;
  tournamentPoints: number;
  tournamentAverage: number;
  participantCount: number;
}) {
  const avgDisplay = participantCount > 0 ? tournamentAverage : "—";

  return (
    <div className="flex w-full flex-wrap gap-2 sm:gap-3 md:w-auto md:max-w-xl">
      <StatPill
        label={t.dashboard.tournamentPointsSoFar}
        value={tournamentPoints}
        tone="primary"
      />
      <StatPill
        label={t.dashboard.tournamentPointsAverage}
        value={avgDisplay}
        footer={
          participantCount > 0
            ? t.dashboard.roundParticipants(participantCount)
            : undefined
        }
      />
    </div>
  );
}

export default async function DashboardPage() {
  const { messages: t } = await getServerI18n();
  const user = await getCurrentUser();
  if (!user) return null;

  const [data, finalistsStatus] = await Promise.all([
    getDashboardData(user.userId),
    getKnockoutBracketPredictionStatus(user.userId),
  ]);
  const tournamentName =
    data.tournamentRound?.name ?? getTournamentRoundName();
  const tournamentStats = statsFromLeaderboard(data.overall, user.userId);
  const myOverall = data.overall.find((e) => e.userId === user.userId);

  return (
    <div className="space-y-6 md:space-y-8">
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-l from-primary/10 via-card to-card p-4 md:p-6">
        <div className="flex flex-col gap-4 md:gap-5">
          <div>
            <h1 className="text-xl font-bold md:text-3xl">
              {t.dashboard.welcome}{" "}
              <span className="text-primary">{user.username}</span>
            </h1>
            <p className="mt-1 text-muted">{t.dashboard.hub}</p>
            <p className="mt-1 text-xs text-muted/80">{tournamentName}</p>
          </div>
          <DashboardHeaderStats
            t={t}
            tournamentPoints={data.totalPoints}
            tournamentAverage={tournamentStats.averagePoints}
            participantCount={tournamentStats.participantCount}
          />
        </div>
      </div>

      <div className="grid gap-3 md:max-w-md md:gap-4">
        <RankStatCard
          href="/leaderboard/overall"
          label={t.dashboard.yourOverallRank}
          rank={myOverall?.rank ?? "—"}
          rankChange={myOverall?.rankChange}
          fullLeaderboardLabel={t.dashboard.fullLeaderboard}
        />
      </div>

      <FinalistsPredictionSummaryCard
        deadline={
          finalistsStatus.deadline
            ? new Date(finalistsStatus.deadline).toISOString()
            : null
        }
        locked={finalistsStatus.locked}
        prediction={
          finalistsStatus.prediction
            ? {
                finalistOneTeam: {
                  name: finalistsStatus.prediction.finalistOneTeam.name,
                  shortName: finalistsStatus.prediction.finalistOneTeam.shortName,
                  logoUrl: finalistsStatus.prediction.finalistOneTeam.logoUrl,
                },
                finalistTwoTeam: {
                  name: finalistsStatus.prediction.finalistTwoTeam.name,
                  shortName: finalistsStatus.prediction.finalistTwoTeam.shortName,
                  logoUrl: finalistsStatus.prediction.finalistTwoTeam.logoUrl,
                },
                championTeam: {
                  name: finalistsStatus.prediction.championTeam.name,
                  shortName: finalistsStatus.prediction.championTeam.shortName,
                  logoUrl: finalistsStatus.prediction.championTeam.logoUrl,
                },
                totalPoints: finalistsStatus.prediction.totalPoints,
              }
            : null
        }
        pointsTotal={finalistsStatus.points?.total ?? null}
      />

      <section className="grid gap-6 md:gap-8">
        <div>
          <div className="mb-3 flex items-center justify-between md:mb-4">
            <h2 className="text-lg font-semibold md:text-xl">{tournamentName}</h2>
            <Link
              href="/leaderboard/overall"
              className="text-sm text-primary hover:underline"
            >
              {t.dashboard.fullLeaderboard} ←
            </Link>
          </div>
          <LeaderboardTable
            entries={data.overall.slice(0, 5)}
            highlightUserId={user.userId}
            pointsLabel={t.leaderboard.points}
            labels={{
              rank: t.leaderboard.rank,
              trend: t.leaderboard.trend,
              username: t.leaderboard.username,
              points: t.leaderboard.points,
              empty: t.leaderboard.empty,
              rankUp: t.leaderboard.rankUp,
              rankDown: t.leaderboard.rankDown,
            }}
          />
        </div>
      </section>
    </div>
  );
}
