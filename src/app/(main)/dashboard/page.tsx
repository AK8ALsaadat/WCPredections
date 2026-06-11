import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import {
  getDashboardData,
  statsFromLeaderboard,
} from "@/services/leaderboard.service";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";
import { Card } from "@/components/ui/Card";
import { ar } from "@/lib/i18n/ar";
import { getTournamentRoundName } from "@/lib/rounds";

function RankStatCard({
  href,
  label,
  rank,
  rankChange,
}: {
  href: string;
  label: string;
  rank: number | string;
  rankChange?: number;
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
          {ar.dashboard.fullLeaderboard} ←
        </p>
      </Card>
    </Link>
  );
}

function RoundStatsInline({
  myPoints,
  averagePoints,
  participantCount,
  pointsSoFarLabel,
  pointsAverageLabel,
}: {
  myPoints: number;
  averagePoints: number;
  participantCount: number;
  pointsSoFarLabel: string;
  pointsAverageLabel: string;
}) {
  const avgDisplay = participantCount > 0 ? averagePoints : "—";

  return (
    <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:gap-3">
      <div className="rounded-xl border border-warning/25 bg-warning/10 px-4 py-3 text-center sm:min-w-[9rem]">
        <p className="text-[11px] leading-tight text-muted">{pointsSoFarLabel}</p>
        <p
          className={`mt-1 text-2xl font-bold tabular-nums ${
            myPoints > 0
              ? "text-warning"
              : myPoints < 0
                ? "text-danger"
                : "text-muted"
          }`}
        >
          {myPoints}
        </p>
      </div>
      <div className="rounded-xl border border-card-border bg-background/40 px-4 py-3 text-center sm:min-w-[9rem]">
        <p className="text-[11px] leading-tight text-muted">{pointsAverageLabel}</p>
        <p className="mt-1 text-2xl font-bold tabular-nums">{avgDisplay}</p>
        {participantCount > 0 && (
          <p className="mt-1 text-[10px] text-muted">
            {ar.dashboard.roundParticipants(participantCount)}
          </p>
        )}
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const data = await getDashboardData(user.userId);
  const tournamentName =
    data.tournamentRound?.name ?? getTournamentRoundName();
  const tournamentStats = statsFromLeaderboard(data.tournamentLb, user.userId);
  const subRoundStats = data.hasSubRound
    ? statsFromLeaderboard(data.subRoundLb, user.userId)
    : null;
  const myOverall = data.overall.find((e) => e.userId === user.userId);

  const subRoundLbHref = data.subRound
    ? `/leaderboard/round/${data.subRound.id}`
    : "/leaderboard/overall";
  const tournamentLbHref = data.tournamentRound
    ? `/leaderboard/round/${data.tournamentRound.id}`
    : "/leaderboard/overall";

  const headerStats =
    data.hasSubRound && subRoundStats ? subRoundStats : tournamentStats;
  const headerStatsLabels =
    data.hasSubRound && subRoundStats
      ? {
          pointsSoFar: ar.dashboard.roundPointsSoFar,
          pointsAverage: ar.dashboard.roundPointsAverage,
        }
      : {
          pointsSoFar: ar.dashboard.tournamentPointsSoFar,
          pointsAverage: ar.dashboard.tournamentPointsAverage,
        };

  return (
    <div className="space-y-6 md:space-y-8">
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-l from-primary/10 via-card to-card p-4 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between md:gap-5">
          <div>
            <h1 className="text-xl font-bold md:text-3xl">
              {ar.dashboard.welcome}،{" "}
              <span className="text-primary">@{user.username}</span>
            </h1>
            <p className="mt-1 text-muted">{ar.dashboard.hub}</p>
            <p className="mt-1 text-xs text-muted/80">{tournamentName}</p>
          </div>
          <RoundStatsInline
            myPoints={headerStats.myPoints}
            averagePoints={headerStats.averagePoints}
            participantCount={headerStats.participantCount}
            pointsSoFarLabel={headerStatsLabels.pointsSoFar}
            pointsAverageLabel={headerStatsLabels.pointsAverage}
          />
        </div>
      </div>

      <div
        className={`grid grid-cols-2 gap-3 md:gap-4 ${data.hasSubRound ? "md:grid-cols-3" : ""}`}
      >
        <Card className="col-span-2 border-primary/15 md:col-span-1">
          <p className="text-xs text-muted md:text-sm">
            {ar.dashboard.totalPoints}
          </p>
          <p
            className={`mt-1 text-2xl font-bold tabular-nums md:text-3xl ${
              data.totalPoints > 0
                ? "text-primary"
                : data.totalPoints < 0
                  ? "text-danger"
                  : "text-muted"
            }`}
          >
            {data.totalPoints}
          </p>
        </Card>

        {data.hasSubRound && subRoundStats && (
          <RankStatCard
            href={subRoundLbHref}
            label={ar.dashboard.yourRoundRank}
            rank={subRoundStats.myRank ?? "—"}
          />
        )}

        <RankStatCard
          href="/leaderboard/overall"
          label={ar.dashboard.yourOverallRank}
          rank={myOverall?.rank ?? "—"}
          rankChange={myOverall?.rankChange}
        />
      </div>

      <section className="grid gap-6 md:gap-8">
        {data.hasSubRound && data.subRound && subRoundStats && (
          <div>
            <div className="mb-3 flex items-center justify-between md:mb-4">
              <div>
                <h2 className="text-lg font-semibold md:text-xl">
                  {ar.leaderboard.round}
                </h2>
                <p className="mt-0.5 text-sm text-muted">{data.subRound.name}</p>
              </div>
              <Link
                href={subRoundLbHref}
                className="shrink-0 text-sm text-primary hover:underline"
              >
                {ar.dashboard.fullLeaderboard} ←
              </Link>
            </div>

            <LeaderboardTable
              entries={data.subRoundLb.slice(0, 5)}
              highlightUserId={user.userId}
              pointsLabel={ar.leaderboard.roundPointsColumn}
            />
          </div>
        )}

        <div>
          <div className="mb-3 flex items-center justify-between md:mb-4">
            <h2 className="text-lg font-semibold md:text-xl">{tournamentName}</h2>
            <Link
              href={tournamentLbHref}
              className="text-sm text-primary hover:underline"
            >
              {ar.dashboard.fullLeaderboard} ←
            </Link>
          </div>
          <LeaderboardTable
            entries={data.tournamentLb.slice(0, 5)}
            highlightUserId={user.userId}
            pointsLabel={ar.leaderboard.roundPointsColumn}
          />
        </div>
      </section>
    </div>
  );
}
