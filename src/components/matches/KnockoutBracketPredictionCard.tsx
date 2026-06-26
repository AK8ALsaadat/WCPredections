"use client";

import { useEffect, useMemo, useState } from "react";
import { clientFetch } from "@/lib/client-fetch";
import { useI18n } from "@/lib/i18n/LocaleProvider";

type Team = { id: string; name: string; shortName: string; logoUrl?: string | null };

type StatusPayload = {
  deadline: string | null;
  locked: boolean;
  teams: Team[];
  prediction: {
    finalistOneTeamId: string;
    finalistTwoTeamId: string;
    championTeamId: string;
    finalistOneTeam: Team;
    finalistTwoTeam: Team;
    championTeam: Team;
  } | null;
  points: {
    finalistOnePoints: number;
    finalistTwoPoints: number;
    championPoints: number;
    total: number;
  } | null;
};

function label(locale: string, ar: string, en: string) {
  return locale === "en" ? en : ar;
}

export function KnockoutBracketPredictionCard() {
  const { locale } = useI18n();
  const [data, setData] = useState<StatusPayload | null>(null);
  const [finalistOneTeamId, setFinalistOneTeamId] = useState("");
  const [finalistTwoTeamId, setFinalistTwoTeamId] = useState("");
  const [championTeamId, setChampionTeamId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let alive = true;
    void clientFetch("/api/knockout-bracket-prediction", { cache: "no-store" })
      .then((res) => (res ? res.json() : null))
      .then((payload) => {
        if (!alive) return;
        if (!payload?.success) return;
        const next = payload.data as StatusPayload;
        setData(next);
        setFinalistOneTeamId(next.prediction?.finalistOneTeamId ?? "");
        setFinalistTwoTeamId(next.prediction?.finalistTwoTeamId ?? "");
        setChampionTeamId(next.prediction?.championTeamId ?? "");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const finalistOptions = useMemo(
    () =>
      data?.teams.map((team) => (
        <option key={team.id} value={team.id}>
          {team.name}
        </option>
      )) ?? [],
    [data?.teams]
  );

  const championOptions = useMemo(
    () =>
      data?.teams
        .filter(
          (team) =>
            team.id === finalistOneTeamId || team.id === finalistTwoTeamId
        )
        .map((team) => (
          <option key={team.id} value={team.id}>
            {team.name}
          </option>
        )) ?? [],
    [data?.teams, finalistOneTeamId, finalistTwoTeamId]
  );

  if (loading) return null;
  if (!data || data.teams.length < 2 || !data.deadline) return null;

  const deadlineText = new Date(data.deadline).toLocaleString(
    locale === "en" ? "en-US" : "ar-SA",
    { dateStyle: "medium", timeStyle: "short" }
  );
  const canSave =
    !data.locked &&
    finalistOneTeamId &&
    finalistTwoTeamId &&
    finalistOneTeamId !== finalistTwoTeamId &&
    championTeamId &&
    (championTeamId === finalistOneTeamId ||
      championTeamId === finalistTwoTeamId);

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/knockout-bracket-prediction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          finalistOneTeamId,
          finalistTwoTeamId,
          championTeamId,
        }),
      });
      const payload = await res.json();
      if (!payload.success) throw new Error(payload.error);
      setMessage(label(locale, "تم حفظ توقع الإقصائيات", "Knockout pick saved"));
      const refreshed = await fetch("/api/knockout-bracket-prediction", {
        cache: "no-store",
      }).then((r) => r.json());
      if (refreshed.success) setData(refreshed.data);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : label(locale, "تعذر الحفظ", "Save failed")
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-primary/30 bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-black text-foreground">
            {label(locale, "توقعات الإقصائيات", "Knockout bracket")}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {label(
              locale,
              "اختر طرفي النهائي والبطل قبل بداية أول مباراة إقصائية. الطرف الصحيح +3، الطرف الثاني +3، والبطل +10.",
              "Pick the two finalists and champion before the first knockout match. Each finalist is +3 and the champion is +10."
            )}
          </p>
          <p className="mt-2 text-xs font-semibold text-primary">
            {label(locale, "الديدلاين", "Deadline")}: {deadlineText}
          </p>
        </div>
        {data.points && (
          <div className="rounded-md border border-card-border px-3 py-2 text-sm">
            <span className="text-muted">
              {label(locale, "النقاط", "Points")}
            </span>
            <span className="ms-2 font-black text-primary">
              {data.points.total}
            </span>
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="block text-sm font-semibold">
          {label(locale, "طرف النهائي الأول", "First finalist")}
          <select
            value={finalistOneTeamId}
            onChange={(event) => {
              setFinalistOneTeamId(event.target.value);
              if (championTeamId && championTeamId !== event.target.value && championTeamId !== finalistTwoTeamId) {
                setChampionTeamId("");
              }
            }}
            disabled={data.locked}
            className="mt-1 w-full rounded-md border border-card-border bg-background px-3 py-2 text-foreground"
          >
            <option value="">
              {label(locale, "اختر منتخب", "Select team")}
            </option>
            {finalistOptions}
          </select>
        </label>
        <label className="block text-sm font-semibold">
          {label(locale, "طرف النهائي الثاني", "Second finalist")}
          <select
            value={finalistTwoTeamId}
            onChange={(event) => {
              setFinalistTwoTeamId(event.target.value);
              if (championTeamId && championTeamId !== finalistOneTeamId && championTeamId !== event.target.value) {
                setChampionTeamId("");
              }
            }}
            disabled={data.locked}
            className="mt-1 w-full rounded-md border border-card-border bg-background px-3 py-2 text-foreground"
          >
            <option value="">
              {label(locale, "اختر منتخب", "Select team")}
            </option>
            {finalistOptions}
          </select>
        </label>
        <label className="block text-sm font-semibold">
          {label(locale, "البطل", "Champion")}
          <select
            value={championTeamId}
            onChange={(event) => setChampionTeamId(event.target.value)}
            disabled={data.locked || !finalistOneTeamId || !finalistTwoTeamId}
            className="mt-1 w-full rounded-md border border-card-border bg-background px-3 py-2 text-foreground"
          >
            <option value="">
              {label(locale, "اختر البطل", "Select champion")}
            </option>
            {championOptions}
          </select>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={!canSave || saving}
          className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving
            ? label(locale, "جاري الحفظ...", "Saving...")
            : data.locked
              ? label(locale, "مغلق", "Locked")
              : label(locale, "حفظ توقع الإقصائيات", "Save bracket")}
        </button>
        {message && <p className="text-sm text-muted">{message}</p>}
        {data.locked && data.prediction && (
          <p className="text-sm text-muted">
            {label(locale, "توقعك محفوظ ومقفل.", "Your bracket is saved and locked.")}
          </p>
        )}
      </div>
    </section>
  );
}
