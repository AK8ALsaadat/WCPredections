"use client";

import { useEffect, useState } from "react";
import { LoadingPage } from "@/components/ui/LoadingSpinner";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { PredictionHistoryCard } from "@/components/predictions/PredictionHistoryCard";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { buildMatchHistoryEntries } from "@/lib/profile-history";
import { useSearchParams } from "next/navigation";

export default function PublicUserPage({ params }: { params: { username: string } }) {
  const { username } = params;
  const { messages: t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [entries, setEntries] = useState<any[]>([]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/users/${encodeURIComponent(username)}/history`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setEntries(data.data.history ?? []);
          setError("");
        } else {
          setError(data.error ?? t.errors.generic);
        }
      })
      .catch(() => setError(t.errors.loadFailed))
      .finally(() => setLoading(false));
  }, [username]);

  if (loading) return <LoadingPage />;
  if (error) return <ErrorMessage message={error} />;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{username}</h1>
      </header>

      <section>
        <h2 className="text-lg font-semibold">{t.profile.history}</h2>
            {entries.length === 0 ? (
          <p className="text-muted">{t.profile.noHistory}</p>
        ) : (
          <div className="space-y-4">
            {entries.map((entry: any) => (
              <PredictionHistoryCard key={entry.match.id} entry={entry} defaultOpen />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
