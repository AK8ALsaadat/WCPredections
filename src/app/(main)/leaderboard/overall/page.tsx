import Link from "next/link";
import { getOverallLeaderboard } from "@/services/leaderboard.service";
import { getTournamentRound } from "@/services/match.service";
import { getCurrentUser } from "@/lib/session";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";
import { getServerI18n } from "@/lib/i18n/server";
import { getTournamentRoundName } from "@/lib/rounds";

// Regenerate leaderboard every 60 seconds
export const revalidate = 60;

export default async function OverallLeaderboardPage() {
  const { messages: t } = await getServerI18n();
  const [leaderboard, user, tournamentRound] = await Promise.all([
    getOverallLeaderboard(),
    getCurrentUser(),
    getTournamentRound(),
  ]);

  const tournamentName = tournamentRound?.name ?? getTournamentRoundName();
  const tournamentMatches = tournamentRound?._count.matches ?? 0;

  return (
    <div className="space-y-6 md:space-y-8">
      <header className="text-end">
        <h1 className="text-xl font-bold md:text-3xl">🏆 {tournamentName}</h1>
        <p className="mt-1 text-xs text-muted md:text-sm">
          {t.leaderboard.overallDesc}
        </p>
        {tournamentMatches > 0 && (
          <p className="mt-1 text-xs text-muted">
            {t.leaderboard.matchCount(tournamentMatches)}
          </p>
        )}
      </header>

      <LeaderboardTable
        entries={leaderboard}
        realtimeEndpoint="/api/leaderboard/overall"
        highlightUserId={user?.userId}
        showRankTrend
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

      <div className="hidden text-center md:block">
        <Link href="/dashboard" className="text-sm text-primary hover:underline">
          {t.leaderboard.backDashboard} ←
        </Link>
      </div>
    </div>
  );
}
