"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { clientFetch } from "@/lib/client-fetch";
import { PredictionHistoryCard } from "@/components/predictions/PredictionHistoryCard";
import { LoadingPage } from "@/components/ui/LoadingSpinner";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Card } from "@/components/ui/Card";
import {
  buildMatchHistoryEntries,
  getPredictionOutcome,
  type MatchHistoryEntry,
} from "@/lib/profile-history";
import { useI18n } from "@/lib/i18n/LocaleProvider";

export default function PredictionsHistoryPage() {
  const { messages: t } = useI18n();
  const [entries, setEntries] = useState<MatchHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void clientFetch("/api/profile")
      .then((r) => (r ? r.json() : null))
      .then((data) => {
        if (data?.success) {
          setEntries(buildMatchHistoryEntries(data.data.history));
        } else {
          setError(data?.error ?? t.errors.loadFailed);
        }
      })
      .catch(() => setError(t.errors.loadFailed))
      .finally(() => setLoading(false));
  }, [t.errors.loadFailed]);

  const stats = useMemo(() => {
    let exact = 0;
    let winner = 0;
    let wrong = 0;
    let pending = 0;
    for (const entry of entries) {
      const outcome = getPredictionOutcome(entry);
      if (outcome === "exact") exact++;
      else if (outcome === "winner") winner++;
      else if (outcome === "wrong") wrong++;
      else if (outcome === "pending") pending++;
    }
    return { exact, winner, wrong, pending };
  }, [entries]);

  if (loading) return <LoadingPage />;
  if (error) return <ErrorMessage message={error} />;

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-8">
      <div>
        <Link href="/matches" className="text-sm text-primary hover:underline">
          ← {t.matches.back}
        </Link>
        <h1 className="mt-3 text-3xl font-bold">{t.predictions.title}</h1>
        <p className="mt-1 text-muted">{t.predictions.subtitle}</p>
      </div>

      {entries.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="p-3 text-center">
            <p className="text-2xl font-bold text-primary">{stats.exact}</p>
            <p className="text-[11px] text-muted">{t.predictions.correctExact}</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-2xl font-bold text-primary">{stats.winner}</p>
            <p className="text-[11px] text-muted">{t.predictions.correctWinner}</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-2xl font-bold text-danger">{stats.wrong}</p>
            <p className="text-[11px] text-muted">{t.predictions.wrong}</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-2xl font-bold text-warning">{stats.pending}</p>
            <p className="text-[11px] text-muted">{t.predictions.pending}</p>
          </Card>
        </div>
      )}

      {entries.length === 0 ? (
        <Card className="p-8 text-center text-muted">
          <p>{t.profile.noHistory}</p>
          <Link href="/matches" className="mt-3 inline-block text-primary hover:underline">
            {t.matches.title} →
          </Link>
        </Card>
      ) : (
        <div className="space-y-4">
          {entries.map((entry) => (
            <PredictionHistoryCard key={entry.match.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
