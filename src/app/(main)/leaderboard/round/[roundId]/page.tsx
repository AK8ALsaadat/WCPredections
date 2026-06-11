import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { getRoundLeaderboard } from "@/services/leaderboard.service";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";
import { getServerI18n } from "@/lib/i18n/server";

export default async function RoundLeaderboardPage({
  params,
}: {
  params: Promise<{ roundId: string }>;
}) {
  const { messages: t } = await getServerI18n();
  const { roundId } = await params;

  const [round, leaderboard, user] = await Promise.all([
    prisma.round.findUnique({
      where: { id: roundId },
      include: { _count: { select: { matches: true } } },
    }),
    getRoundLeaderboard(roundId),
    getCurrentUser(),
  ]);

  if (!round) notFound();

  return (
    <div className="space-y-6">
      <header className="text-end">
        <Link
          href="/leaderboard/overall"
          className="mb-2 inline-block text-xs text-primary hover:underline md:text-sm"
        >
          ← {t.leaderboard.overall}
        </Link>
        <h1 className="text-xl font-bold md:text-3xl">{round.name}</h1>
        <p className="mt-1 text-xs text-muted md:text-sm">
          {t.leaderboard.roundDesc}
        </p>
        {round._count.matches > 0 && (
          <p className="mt-1 text-xs text-muted">
            {t.leaderboard.matchCount(round._count.matches)}
          </p>
        )}
      </header>

      <LeaderboardTable
        entries={leaderboard}
        highlightUserId={user?.userId}
        pointsLabel={t.leaderboard.roundPointsColumn}
      />

      <div className="flex justify-center gap-4 text-sm">
        <Link href="/matches" className="text-primary hover:underline">
          {t.leaderboard.viewMatches}
        </Link>
      </div>
    </div>
  );
}
