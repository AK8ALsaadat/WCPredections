import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";
import { getKnockoutLeaderboard } from "@/services/knockout-bracket-prediction.service";

export const revalidate = 60;

export default async function KnockoutLeaderboardPage() {
  const [leaderboard, user] = await Promise.all([
    getKnockoutLeaderboard(),
    getCurrentUser(),
  ]);

  return (
    <div className="space-y-6 md:space-y-8">
      <header className="text-end">
        <p className="text-xs font-black uppercase tracking-wider text-primary">
          Bracket leaderboard
        </p>
        <h1 className="mt-1 text-xl font-bold md:text-3xl">
          ترتيب توقع مسار البطل
        </h1>
        <p className="mt-1 text-xs text-muted md:text-sm">
          نقاط مستقلة عن ترتيب الدوري العام، محسوبة من اختيارات دور الـ32 حتى البطل.
        </p>
      </header>

      <LeaderboardTable
        entries={leaderboard}
        realtimeEndpoint="/api/leaderboard/knockout"
        highlightUserId={user?.userId}
        pointsLabel="نقاط المسار"
        labels={{
          rank: "الترتيب",
          trend: "التغير",
          username: "المتوقع",
          points: "النقاط",
          empty: "لسه ما فيه نقاط في مسار البطل.",
          rankUp: "تحسن الترتيب",
          rankDown: "تراجع الترتيب",
        }}
      />

      <div className="flex justify-center gap-4 text-sm">
        <Link href="/knockout-bracket" className="text-primary hover:underline">
          توقع مسارك
        </Link>
        <Link href="/leaderboard/overall" className="text-muted hover:text-primary">
          الترتيب العام
        </Link>
      </div>
    </div>
  );
}
