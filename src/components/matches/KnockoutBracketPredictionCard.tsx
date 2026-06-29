"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

export function KnockoutBracketPredictionCard() {
  const [status, setStatus] = useState<BracketPredictionStatus | null>(null);
  const [finalistOneTeamId, setFinalistOneTeamId] = useState("");
  const [finalistTwoTeamId, setFinalistTwoTeamId] = useState("");
  const [championTeamId, setChampionTeamId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

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

  return (
    <section className="rounded-lg border border-primary/35 bg-gradient-to-l from-primary/10 via-card to-card p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="text-end">
          <p className="text-xs font-black uppercase tracking-wider text-primary">
            توقع النهائي
          </p>
          <h2 className="mt-1 text-lg font-black text-foreground">
            اختر طرفي النهائي والبطل
          </h2>
          <p className="mt-1 text-sm text-muted">
            الديدلاين {formatDeadline(status?.deadline ?? null)} بتوقيت الرياض. كل طرف نهائي صحيح +3، والبطل الصحيح +10.
          </p>
          <p className="mt-2 text-xs text-warning">
            من دور 16 لك مضاعفة واحدة فقط. من ربع النهائي تقدر تجمع مضاعفة واحدة مع الرهان، والرهان يصير +10 أو -10.
          </p>
        </div>

        <form onSubmit={handleSave} className="grid w-full gap-3 lg:max-w-xl">
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
                <span className="text-muted">
                  محفوظ: {status.prediction.finalistOneTeam.name} و{" "}
                  {status.prediction.finalistTwoTeam.name}، البطل{" "}
                  {status.prediction.championTeam.name}
                </span>
              )}
              {saved && <span className="text-primary">تم حفظ توقع النهائي</span>}
              {error && <span className="text-danger">{error}</span>}
              {status?.locked && <span className="text-warning">انتهى وقت التوقع</span>}
            </div>
            <div className="flex gap-2">
              <Link
                href="/leaderboard/knockout"
                className="inline-flex items-center justify-center rounded-lg border border-card-border px-3 py-2 text-xs font-bold text-foreground transition hover:border-primary/50"
              >
                ليدربورد النهائي
              </Link>
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
