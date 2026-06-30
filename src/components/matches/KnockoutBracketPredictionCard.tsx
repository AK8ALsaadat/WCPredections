"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { clientFetch } from "@/lib/client-fetch";
import { invalidateMatchesListCaches } from "@/lib/predict-prefetch";

type TeamRef = {
  id: string;
  name: string;
  shortName: string;
  logoUrl?: string | null;
};

type BracketPredictionStatus = {
  deadline: string | Date | null;
  locked: boolean;
  finalistCandidates: TeamRef[];
  prediction: {
    finalistOneTeam: TeamRef;
    finalistTwoTeam: TeamRef;
    championTeam: TeamRef;
    totalPoints: number;
  } | null;
  points: {
    finalistOnePoints: number;
    finalistTwoPoints: number;
    championPoints: number;
    total: number;
  } | null;
};

function ChampionCrownIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="m3 7 4.4 3.4L12 4l4.6 6.4L21 7l-1.5 10.5h-15L3 7Z"
        fill="currentColor"
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

function ChampionBadge({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300/60 bg-amber-400/15 px-2.5 py-1 text-xs font-black text-amber-100 shadow-[0_0_16px_rgba(245,158,11,0.18)]">
      <ChampionCrownIcon className="h-3.5 w-3.5 text-amber-200" />
      <span className="text-amber-200">البطل المتوقع</span>
      <span className="text-foreground">{name}</span>
    </span>
  );
}

function TeamLogo({
  team,
  className = "h-12 w-12",
}: {
  team: TeamRef | null;
  className?: string;
}) {
  const label = team?.shortName || team?.name?.slice(0, 3) || "--";

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-background/70 text-xs font-black text-muted shadow-inner ${className}`}
    >
      {team?.logoUrl ? (
        <img
          src={team.logoUrl}
          alt={team.name}
          className="h-full w-full object-contain p-1.5"
        />
      ) : (
        <span>{label}</span>
      )}
    </span>
  );
}

function FinalistTile({
  team,
  label,
}: {
  team: TeamRef | null;
  label: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-background/45 px-3 py-3">
      <p className="text-[10px] font-bold text-muted">{label}</p>
      <div className="mt-2 flex items-center gap-3">
        <TeamLogo team={team} />
        <p className="min-w-0 truncate text-sm font-black text-foreground">
          {team?.name ?? "لم يتم الاختيار"}
        </p>
      </div>
    </div>
  );
}

function formatDeadline(deadline: string | Date | null) {
  if (!deadline) return "لم يحدد بعد";
  return new Intl.DateTimeFormat("ar-SA", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Riyadh",
  }).format(new Date(deadline));
}

function formatCountdown(deadline: string | Date | null, now: number) {
  if (!deadline) return "--:--";
  const diffMs = new Date(deadline).getTime() - now;
  if (diffMs <= 0) return "مغلق";

  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}ي ${hours}س ${minutes}د`;
  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export function KnockoutBracketPredictionCard() {
  const [status, setStatus] = useState<BracketPredictionStatus | null>(null);
  const [finalistOneTeamId, setFinalistOneTeamId] = useState("");
  const [finalistTwoTeamId, setFinalistTwoTeamId] = useState("");
  const [championTeamId, setChampionTeamId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let alive = true;
    void clientFetch("/api/knockout-bracket-prediction", { cache: "no-store" })
      .then((res) => (res ? res.json() : null))
      .then((payload) => {
        if (!alive) return;
        if (!payload?.success) throw new Error(payload?.error ?? "load failed");
        const nextStatus = payload.data as BracketPredictionStatus;
        setStatus(nextStatus);
        setFinalistOneTeamId(nextStatus.prediction?.finalistOneTeam.id ?? "");
        setFinalistTwoTeamId(nextStatus.prediction?.finalistTwoTeam.id ?? "");
        setChampionTeamId(nextStatus.prediction?.championTeam.id ?? "");
      })
      .catch(() => {
        if (alive) setError("تعذر تحميل كرت توقع النهائي");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const teamOptions = useMemo(
    () => [
      { value: "", label: "اختر المنتخب" },
      ...(status?.finalistCandidates ?? []).map((team) => ({
        value: team.id,
        label: team.name,
      })),
    ],
    [status?.finalistCandidates]
  );

  const championOptions = useMemo(() => {
    const selected = new Set([finalistOneTeamId, finalistTwoTeamId].filter(Boolean));
    const teams = (status?.finalistCandidates ?? []).filter((team) =>
      selected.has(team.id)
    );
    return [
      { value: "", label: "اختر البطل" },
      ...teams.map((team) => ({ value: team.id, label: team.name })),
    ];
  }, [finalistOneTeamId, finalistTwoTeamId, status?.finalistCandidates]);

  useEffect(() => {
    if (
      championTeamId &&
      championTeamId !== finalistOneTeamId &&
      championTeamId !== finalistTwoTeamId
    ) {
      setChampionTeamId("");
    }
  }, [championTeamId, finalistOneTeamId, finalistTwoTeamId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaved(false);

    if (!finalistOneTeamId || !finalistTwoTeamId || !championTeamId) {
      setError("اختر طرفي النهائي والبطل");
      return;
    }
    if (finalistOneTeamId === finalistTwoTeamId) {
      setError("طرفا النهائي لازم يكونان منتخبين مختلفين");
      return;
    }

    setSaving(true);
    try {
      const res = await clientFetch("/api/knockout-bracket-prediction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          finalistOneTeamId,
          finalistTwoTeamId,
          championTeamId,
        }),
      });
      const payload = res ? await res.json() : null;
      if (!res?.ok || !payload?.success) {
        throw new Error(payload?.error ?? "تعذر حفظ توقع النهائي");
      }
      const nextStatus = payload.data as BracketPredictionStatus;
      setStatus(nextStatus);
      setFinalistOneTeamId(nextStatus.prediction?.finalistOneTeam.id ?? finalistOneTeamId);
      setFinalistTwoTeamId(nextStatus.prediction?.finalistTwoTeam.id ?? finalistTwoTeamId);
      setChampionTeamId(nextStatus.prediction?.championTeam.id ?? championTeamId);
      invalidateMatchesListCaches();
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر حفظ توقع النهائي");
    } finally {
      setSaving(false);
    }
  }

  const hasTeams = (status?.finalistCandidates.length ?? 0) > 1;
  const disabled = loading || saving || status?.locked || !hasTeams;
  const countdown = formatCountdown(status?.deadline ?? null, now);
  const selectedFinalistOne =
    status?.finalistCandidates.find((team) => team.id === finalistOneTeamId) ??
    status?.prediction?.finalistOneTeam ??
    null;
  const selectedFinalistTwo =
    status?.finalistCandidates.find((team) => team.id === finalistTwoTeamId) ??
    status?.prediction?.finalistTwoTeam ??
    null;
  const selectedChampion =
    status?.finalistCandidates.find((team) => team.id === championTeamId) ??
    status?.prediction?.championTeam ??
    null;

  return (
    <section className="overflow-hidden rounded-lg border border-amber-300/35 bg-gradient-to-l from-amber-500/12 via-card to-card p-4 shadow-[0_18px_55px_rgba(0,0,0,0.28)] md:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:justify-between">
        <div className="flex-1 text-end">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="rounded-lg border border-amber-300/45 bg-background/70 px-3 py-1.5 text-sm font-black tabular-nums text-amber-200 shadow-inner">
              {countdown}
            </span>
            <p className="text-xs font-black uppercase tracking-wider text-amber-200">
              توقع النهائي
            </p>
          </div>
          <h2 className="mt-2 text-xl font-black text-foreground">
            طرفا النهائي والبطل
          </h2>
          <p className="mt-1 text-sm text-muted">
            الديدلاين {formatDeadline(status?.deadline ?? null)} بتوقيت الرياض
          </p>

          <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <FinalistTile team={selectedFinalistOne} label="طرف النهائي" />
            <span className="mx-auto hidden rounded-lg border border-card-border bg-background/60 px-3 py-2 text-xs font-black text-muted sm:block">
              VS
            </span>
            <FinalistTile team={selectedFinalistTwo} label="طرف النهائي" />
          </div>

          <div className="mt-3 rounded-lg border border-amber-300/35 bg-amber-400/10 px-3 py-3">
            <div className="flex items-center justify-end gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black text-amber-200">
                  البطل المتوقع
                </p>
                <p className="mt-1 truncate text-lg font-black text-foreground">
                  {selectedChampion?.name ?? "لم يتم الاختيار"}
                </p>
              </div>
              <TeamLogo team={selectedChampion} className="h-14 w-14" />
              <ChampionCrownIcon className="h-7 w-7 shrink-0 text-amber-200" />
            </div>
          </div>
        </div>

        <form
          onSubmit={handleSave}
          className="grid w-full content-between gap-3 rounded-lg border border-white/10 bg-background/35 p-3 lg:max-w-xl"
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Select
              label="طرف النهائي الأول"
              value={finalistOneTeamId}
              onChange={(e) => setFinalistOneTeamId(e.target.value)}
              options={teamOptions}
              disabled={disabled}
            />
            <Select
              label="طرف النهائي الثاني"
              value={finalistTwoTeamId}
              onChange={(e) => setFinalistTwoTeamId(e.target.value)}
              options={teamOptions.map((option) => ({
                ...option,
                disabled: option.value !== "" && option.value === finalistOneTeamId,
              }))}
              disabled={disabled}
            />
            <Select
              label="البطل"
              value={championTeamId}
              onChange={(e) => setChampionTeamId(e.target.value)}
              options={championOptions}
              disabled={disabled || !finalistOneTeamId || !finalistTwoTeamId}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs">
              {status?.prediction && (
                <span className="inline-flex flex-wrap items-center gap-2 text-muted">
                  <span>
                    محفوظ: {status.prediction.finalistOneTeam.name} و{" "}
                    {status.prediction.finalistTwoTeam.name}
                  </span>
                  <ChampionBadge name={status.prediction.championTeam.name} />
                </span>
              )}
              {saved && <span className="text-primary">تم حفظ توقع النهائي</span>}
              {error && <span className="text-danger">{error}</span>}
              {status?.locked && <span className="text-warning">انتهى وقت التوقع</span>}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {status?.locked && (
                <Link
                  href="/finalists-predictions"
                  className="rounded-lg bg-primary px-3 py-2 text-sm font-bold text-white transition hover:bg-primary-hover"
                >
                  شف توقعات الدوري
                </Link>
              )}
              <Button type="submit" size="sm" loading={saving} disabled={disabled}>
                حفظ توقع النهائي
              </Button>
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}
