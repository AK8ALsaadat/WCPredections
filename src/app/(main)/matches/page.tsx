"use client";

import { useEffect, useState, useCallback } from "react";
import { MatchCard } from "@/components/matches/MatchCard";
import { LoadingPage } from "@/components/ui/LoadingSpinner";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Select } from "@/components/ui/Select";
import { formatDayHeader, getPredictionTimezone } from "@/lib/utils";
import { ar } from "@/lib/i18n/ar";

type Round = { id: string; name: string };
type Match = Parameters<typeof MatchCard>[0]["match"];

const REFRESH_MS = 300_000; // 5 دقائق — من قاعدة البيانات فقط بدون API

export default function MatchesPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [selectedRound, setSelectedRound] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const predictionTimezone = getPredictionTimezone();

  const loadMatches = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);
    const params = new URLSearchParams({ schedule: "true" });
    if (selectedRound) params.set("roundId", selectedRound);

    try {
      const res = await fetch(`/api/matches?${params}`);
      const data = await res.json();
      if (data.success) {
        setMatches(data.data);
        setLastUpdate(new Date());
        setError("");
      } else {
        setError(data.error);
      }
    } catch {
      setError(ar.errors.loadFailed);
    } finally {
      if (showLoader) setLoading(false);
    }
  }, [selectedRound]);

  useEffect(() => {
    fetch("/api/rounds")
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setRounds(data.data);
      });
  }, []);

  useEffect(() => {
    loadMatches(true);
    const interval = setInterval(() => loadMatches(false), REFRESH_MS);
    return () => clearInterval(interval);
  }, [loadMatches]);

  const grouped = matches.reduce<Record<string, Match[]>>((acc, match) => {
    const d = new Date(match.matchTime);
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString();
    if (!acc[key]) acc[key] = [];
    acc[key].push(match);
    return acc;
  }, {});

  const sortedDays = Object.keys(grouped).sort();

  if (loading) return <LoadingPage />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{ar.matches.title}</h1>
          <p className="mt-1 text-muted">{ar.matches.subtitle}</p>
          {lastUpdate && (
            <p className="mt-1 text-xs text-muted">
              آخر تحديث: {lastUpdate.toLocaleTimeString("ar-SA")} · بيانات رسمية من football-data.org
            </p>
          )}
        </div>
        {rounds.length > 0 && (
          <div className="w-full sm:w-64">
            <Select
              label={ar.matches.filterRound}
              value={selectedRound}
              onChange={(e) => setSelectedRound(e.target.value)}
              options={[
                { value: "", label: ar.matches.allRounds },
                ...rounds.map((r) => ({ value: r.id, label: r.name })),
              ]}
            />
          </div>
        )}
      </div>

      <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
        {ar.matches.lockNotice}
      </div>

      <p className="text-sm text-muted">
        {ar.matches.predictWindow}{" "}
        <span className="text-primary">
          ({formatDayHeader(new Date())} — {predictionTimezone})
        </span>
      </p>

      {error && <ErrorMessage message={error} />}

      {matches.length === 0 ? (
        <div className="rounded-xl border border-card-border bg-card p-12 text-center text-muted">
          <p>{ar.matches.noMatches}</p>
          <p className="mt-2 text-xs">انتظر المزامنة أو اطلب من المشرف تشغيلها من لوحة الإدارة</p>
        </div>
      ) : (
        <div className="space-y-8">
          {sortedDays.map((dayKey) => (
            <section key={dayKey}>
              <h2 className="mb-4 border-b border-card-border pb-2 text-lg font-semibold text-primary">
                {formatDayHeader(dayKey)}
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                {grouped[dayKey].map((match) => (
                  <MatchCard key={match.id} match={match} showPredictButton />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
