import Link from "next/link";
import { getOverallLeaderboard } from "@/services/leaderboard.service";
import { getSubRounds, getTournamentRound } from "@/services/match.service";
import { getCurrentUser } from "@/lib/session";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";
import { Card } from "@/components/ui/Card";
import { getServerI18n } from "@/lib/i18n/server";
import { getTournamentRoundName } from "@/lib/rounds";

// Regenerate leaderboard every 60 seconds
export const revalidate = 60;

export default async function OverallLeaderboardPage() {
  const { messages: t } = await getServerI18n();
  const leaderboard = await getOverallLeaderboard();
  const user = await getCurrentUser();
  const tournamentRound = await getTournamentRound();
  const subRounds = await getSubRounds();

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

      {subRounds.length > 0 && (
        <section className="space-y-3 border-t border-card-border pt-6">
          <h2 className="text-end text-base font-semibold md:text-lg">
            {t.leaderboard.round}
          </h2>
          <div className="space-y-2">
            {subRounds.map((round) => (
              <Link key={round.id} href={`/leaderboard/round/${round.id}`}>
                <Card className="cursor-pointer transition-colors active:border-primary/50">
                  <div className="flex items-center justify-between gap-3 py-1">
                    <span className="text-xs text-muted">
                      {t.leaderboard.matchCount(round._count.matches)}
                    </span>
                    <span className="font-medium">{round.name}</span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="hidden text-center md:block">
        <Link href="/dashboard" className="text-sm text-primary hover:underline">
          {t.leaderboard.backDashboard} ←
        </Link>
      </div>
    </div>
  );
}
