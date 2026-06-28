"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TeamLogo } from "@/components/ui/TeamLogo";

type Team = { id: string; name: string; shortName: string; logoUrl?: string | null };
type BracketRound = {
  key: string;
  labelAr: string;
  labelEn: string;
  points: number;
  matchNos: number[];
};
type BracketMatch = {
  matchNo: number;
  points: number;
  matchTime: string | null;
  homeTeam: Team | null;
  awayTeam: Team | null;
  homeSourceMatchNo: number | null;
  awaySourceMatchNo: number | null;
  homeSlotLabel: string;
  awaySlotLabel: string;
  actualWinnerTeamId: string | null;
};
type StatusPayload = {
  deadline: string | null;
  locked: boolean;
  rounds: BracketRound[];
  matches: BracketMatch[];
  maxPoints: number;
  prediction: { picks: Record<string, string>; totalPoints: number } | null;
  points: { total: number; matchPoints: Record<string, number> } | null;
};

function teamKey(team: Team | null) {
  return team?.id ?? "";
}

function formatDate(value: string | null) {
  if (!value) return "لم يحدد بعد";
  return new Date(value).toLocaleString("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function TeamButton({
  team,
  label,
  selected,
  disabled,
  earned,
  onClick,
}: {
  team: Team | null;
  label: string;
  selected: boolean;
  disabled: boolean;
  earned: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled || !team}
      onClick={onClick}
      className={`flex min-h-12 w-full items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-start transition ${
        selected
          ? "border-primary bg-primary/15 text-foreground shadow-[inset_0_0_0_1px_rgba(34,197,94,0.25)]"
          : "border-card-border bg-background/70 hover:border-primary/40"
      } ${disabled || !team ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <span className="flex min-w-0 items-center gap-2">
        {team ? (
          <TeamLogo name={team.name} shortName={team.shortName} logoUrl={team.logoUrl} size="sm" />
        ) : (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-card-border text-[10px] text-muted">
            {label}
          </span>
        )}
        <span className="truncate text-sm font-bold">
          {team?.name ?? label}
        </span>
      </span>
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
          earned ? "bg-primary" : selected ? "bg-primary/70" : "bg-card-border"
        }`}
      />
    </button>
  );
}

export function KnockoutBracketBuilder() {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/knockout-bracket-prediction", { cache: "no-store" })
      .then((res) => res.json())
      .then((payload) => {
        if (!alive || !payload?.success) return;
        const next = payload.data as StatusPayload;
        setData(next);
        setPicks(next.prediction?.picks ?? {});
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const matchByNo = useMemo(
    () => new Map(data?.matches.map((match) => [match.matchNo, match]) ?? []),
    [data?.matches]
  );

  const resolvedTeams = useMemo(() => {
    const winners = new Map<number, Team>();
    for (const match of data?.matches ?? []) {
      const home =
        match.homeSourceMatchNo != null
          ? winners.get(match.homeSourceMatchNo) ?? null
          : match.homeTeam;
      const away =
        match.awaySourceMatchNo != null
          ? winners.get(match.awaySourceMatchNo) ?? null
          : match.awayTeam;
      const picked = picks[String(match.matchNo)];
      const winner = picked === teamKey(home) ? home : picked === teamKey(away) ? away : null;
      if (winner) winners.set(match.matchNo, winner);
    }
    return winners;
  }, [data?.matches, picks]);

  function participants(match: BracketMatch) {
    return {
      home:
        match.homeSourceMatchNo != null
          ? resolvedTeams.get(match.homeSourceMatchNo) ?? null
          : match.homeTeam,
      away:
        match.awaySourceMatchNo != null
          ? resolvedTeams.get(match.awaySourceMatchNo) ?? null
          : match.awayTeam,
    };
  }

  function chooseWinner(matchNo: number, teamId: string) {
    if (data?.locked) return;
    const order = data?.matches.map((match) => match.matchNo) ?? [];
    const index = order.indexOf(matchNo);
    setPicks((current) => {
      const next = { ...current, [String(matchNo)]: teamId };
      for (const later of order.slice(index + 1)) {
        delete next[String(later)];
      }
      return next;
    });
    setMessage("");
  }

  const completed = useMemo(() => {
    if (!data) return 0;
    return data.matches.filter((match) => picks[String(match.matchNo)]).length;
  }, [data, picks]);

  const canSave = Boolean(data && !data.locked && completed === data.matches.length);

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/knockout-bracket-prediction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ picks }),
      });
      const payload = await res.json();
      if (!payload.success) throw new Error(payload.error ?? "Save failed");
      const next = payload.data as StatusPayload;
      setData(next);
      setPicks(next.prediction?.picks ?? picks);
      setMessage("تم حفظ مسار البطل");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر الحفظ");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-card-border bg-card p-6 text-center text-sm text-muted">
        جاري تحميل مسار البطولة...
      </div>
    );
  }

  if (!data || data.matches.length === 0) {
    return (
      <div className="rounded-lg border border-card-border bg-card p-6 text-center text-sm text-muted">
        جدول الإقصائيات غير جاهز بعد.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-lg border border-card-border bg-card">
        <div className="grid gap-4 p-4 md:grid-cols-[1fr_auto] md:items-center md:p-5">
          <div className="text-end">
            <p className="text-xs font-black uppercase tracking-wider text-primary">
              World Cup 26 bracket
            </p>
            <h1 className="mt-1 text-2xl font-black md:text-4xl">
              توقع مسار البطل من دور الـ32
            </h1>
            <p className="mt-2 text-sm text-muted">
              اختر الفائز من كل مباراة، والمنتخب المتأهل ينتقل تلقائياً للدور التالي.
              يقفل التوقع مع بداية أول مباراة إقصائية.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4 md:min-w-[420px]">
            <div className="rounded-md border border-card-border bg-background/70 p-3">
              <p className="text-[11px] text-muted">الديدلاين</p>
              <p className="mt-1 text-xs font-black">{formatDate(data.deadline)}</p>
            </div>
            <div className="rounded-md border border-card-border bg-background/70 p-3">
              <p className="text-[11px] text-muted">الحالة</p>
              <p className="mt-1 text-sm font-black text-primary">
                {data.locked ? "مقفل" : "مفتوح"}
              </p>
            </div>
            <div className="rounded-md border border-card-border bg-background/70 p-3">
              <p className="text-[11px] text-muted">اكتمال المسار</p>
              <p className="mt-1 text-sm font-black">
                {completed}/{data.matches.length}
              </p>
            </div>
            <div className="rounded-md border border-card-border bg-background/70 p-3">
              <p className="text-[11px] text-muted">نقاطك</p>
              <p className="mt-1 text-sm font-black text-primary">
                {data.points?.total ?? data.prediction?.totalPoints ?? 0}/{data.maxPoints}
              </p>
            </div>
          </div>
        </div>
        <div className="border-t border-card-border bg-background/45 px-4 py-3">
          <div className="flex flex-wrap justify-end gap-2 text-xs">
            {data.rounds.map((round) => (
              <span key={round.key} className="rounded-full border border-card-border px-3 py-1 text-muted">
                {round.labelAr}: +{round.points}
              </span>
            ))}
          </div>
        </div>
      </section>

      <div className="overflow-x-auto pb-2">
        <div className="grid min-w-[1180px] grid-cols-5 gap-3">
          {data.rounds.map((round) => (
            <section key={round.key} className="space-y-2">
              <div className="sticky top-[73px] z-10 rounded-md border border-card-border bg-background/95 px-3 py-2 text-end backdrop-blur">
                <h2 className="text-sm font-black">{round.labelAr}</h2>
                <p className="text-[11px] text-muted">+{round.points} لكل فائز صحيح</p>
              </div>
              <div className="space-y-2">
                {round.matchNos.map((matchNo) => {
                  const match = matchByNo.get(matchNo);
                  if (!match) return null;
                  const { home, away } = participants(match);
                  const selected = picks[String(matchNo)];
                  const earned = data.points?.matchPoints[String(matchNo)] ?? 0;
                  const locked = data.locked;
                  return (
                    <article key={matchNo} className="rounded-lg border border-card-border bg-card/90 p-2 shadow-sm">
                      <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-muted">
                        <span>+{match.points}</span>
                        <span className="font-bold">M{matchNo}</span>
                      </div>
                      <div className="space-y-1.5">
                        <TeamButton
                          team={home}
                          label={match.homeSlotLabel}
                          selected={selected === home?.id}
                          disabled={locked}
                          earned={earned > 0 && selected === home?.id}
                          onClick={() => home && chooseWinner(matchNo, home.id)}
                        />
                        <TeamButton
                          team={away}
                          label={match.awaySlotLabel}
                          selected={selected === away?.id}
                          disabled={locked}
                          earned={earned > 0 && selected === away?.id}
                          onClick={() => away && chooseWinner(matchNo, away.id)}
                        />
                      </div>
                      {match.actualWinnerTeamId && (
                        <p className="mt-2 text-end text-[11px] text-muted">
                          الفائز الفعلي محفوظ
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      <div className="sticky bottom-20 z-20 rounded-lg border border-card-border bg-background/95 p-3 shadow-xl backdrop-blur md:bottom-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-end text-sm">
            <p className="font-bold">
              {data.locked
                ? "المسار مقفل ومحفوظ حسب آخر اختيار."
                : canSave
                  ? "المسار مكتمل وجاهز للحفظ."
                  : "كمل كل المباريات عشان تحفظ التوقع."}
            </p>
            {message && <p className="mt-1 text-xs text-muted">{message}</p>}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Link
              href="/leaderboard/knockout"
              className="inline-flex items-center justify-center rounded-lg border border-card-border px-4 py-2 text-sm font-bold text-foreground hover:border-primary/50"
            >
              ليدربورد المسار
            </Link>
            <Button onClick={() => void save()} loading={saving} disabled={!canSave}>
              {data.locked ? "مقفل" : "حفظ المسار"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
