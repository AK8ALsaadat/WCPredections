import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { getRoundLeaderboard } from "@/services/leaderboard.service";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";
import { ar } from "@/lib/i18n/ar";

export default async function RoundLeaderboardPage({
  params,
}: {
  params: Promise<{ roundId: string }>;
}) {
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
      <header className="text-right">
        <Link
          href="/leaderboard/overall"
          className="mb-2 inline-block text-xs text-primary hover:underline md:text-sm"
        >
          ← {ar.leaderboard.overall}
        </Link>
        <h1 className="text-xl font-bold md:text-3xl">{round.name}</h1>
        <p className="mt-1 text-xs text-muted md:text-sm">
          {ar.leaderboard.roundDesc}
        </p>
        {round._count.matches > 0 && (
          <p className="mt-1 text-xs text-muted">
            {round._count.matches} مباراة
          </p>
        )}
      </header>

      <LeaderboardTable
        entries={leaderboard}
        highlightUserId={user?.userId}
        pointsLabel={ar.leaderboard.roundPointsColumn}
      />

      <div className="flex justify-center gap-4 text-sm">
        <Link href="/matches" className="text-primary hover:underline">
          {ar.leaderboard.viewMatches}
        </Link>
      </div>
    </div>
  );
}
