import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { Card } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

function ChampionIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="currentColor"
        d="m3 7 4.4 3.4L12 4l4.6 6.4L21 7l-1.5 10.5h-15L3 7Z"
      />
      <path
        d="M5 20h14"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

type Team = {
  name: string;
  shortName: string;
  logoUrl?: string | null;
};

function TeamLogo({
  team,
  className = "h-6 w-6",
}: {
  team: Team;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-card-border/40 bg-background text-[10px] font-black text-muted ${className}`}
    >
      {team.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={team.logoUrl}
          alt={team.name}
          className="h-full w-full object-contain"
        />
      ) : (
        team.shortName.slice(0, 3)
      )}
    </span>
  );
}

function TeamPick({ team }: { team: Team }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2 rounded-lg border border-card-border bg-background/50 px-2.5 py-2">
      <TeamLogo team={team} />
      <span className="truncate text-sm font-bold text-foreground">
        {team.name}
      </span>
    </span>
  );
}

export default async function FinalistsPredictionsPage() {
  const [user, predictions] = await Promise.all([
    getCurrentUser(),
    prisma.knockoutBracketPrediction.findMany({
      select: {
        userId: true,
        totalPoints: true,
        finalistOneTeam: {
          select: { name: true, shortName: true, logoUrl: true },
        },
        finalistTwoTeam: {
          select: { name: true, shortName: true, logoUrl: true },
        },
        championTeam: {
          select: { name: true, shortName: true, logoUrl: true },
        },
        user: { select: { username: true } },
      },
      orderBy: [{ user: { username: "asc" } }],
    }),
  ]);

  return (
    <div className="space-y-6 md:space-y-8">
      <header className="text-end">
        <p className="text-xs font-black uppercase tracking-wider text-primary">
          Final predictions
        </p>
        <h1 className="mt-1 text-xl font-black md:text-3xl">
          توقعات الدوري للنهائي
        </h1>
        <p className="mt-1 text-sm text-muted">
          أطراف النهائي والبطل المتوقع لكل لاعب بعد قفل الديدلاين.
        </p>
      </header>

      {predictions.length === 0 ? (
        <Card>
          <p className="py-8 text-center text-sm text-muted">
            ما فيه توقعات محفوظة للنهائي حالياً.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {predictions.map((prediction) => {
            const isMe = prediction.userId === user?.userId;
            return (
              <Card
                key={prediction.userId}
                className={`p-0 ${
                  isMe
                    ? "border-primary/50 bg-primary/10"
                    : "border-card-border bg-card"
                }`}
              >
                <div className="grid gap-3 p-4 md:grid-cols-[minmax(8rem,0.8fr)_1fr_auto] md:items-center">
                  <div className="text-end">
                    <p className="text-xs text-muted">المتوقع</p>
                    <p className="text-base font-black text-foreground">
                      {prediction.user.username}
                    </p>
                  </div>

                  <div className="grid min-w-0 gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                    <TeamPick team={prediction.finalistOneTeam} />
                    <span className="hidden text-center text-xs font-black text-muted sm:block">
                      VS
                    </span>
                    <TeamPick team={prediction.finalistTwoTeam} />
                  </div>

                  <div className="flex items-center justify-end gap-2 rounded-lg border border-amber-300/40 bg-amber-400/10 px-3 py-2 text-amber-100">
                    <ChampionIcon />
                    <div className="text-end">
                      <p className="text-[10px] font-bold text-amber-200">
                        البطل
                      </p>
                      <p className="text-sm font-black text-foreground">
                        {prediction.championTeam.name}
                      </p>
                    </div>
                    <TeamLogo
                      team={prediction.championTeam}
                    />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <div className="text-center">
        <Link href="/dashboard" className="text-sm text-primary hover:underline">
          الرجوع للرئيسية
        </Link>
      </div>
    </div>
  );
}
