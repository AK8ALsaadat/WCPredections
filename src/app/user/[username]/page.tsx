"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoadingPage } from "@/components/ui/LoadingSpinner";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { PredictionHistoryCard } from "@/components/predictions/PredictionHistoryCard";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { useApi } from "@/lib/use-swr";
import type { MatchHistoryEntry } from "@/lib/profile-history";

export default function PublicUserPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = use(params);
  const router = useRouter();
  const { messages: t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [entries, setEntries] = useState<MatchHistoryEntry[]>([]);

  const { data, error: swrError } = useApi<{
    success: boolean;
    data?: { history?: MatchHistoryEntry[] };
    error?: string;
  }>(`/api/users/${encodeURIComponent(username)}/history`);

  useEffect(() => {
    if (!data && !swrError) return;

    setLoading(false);

    if (swrError) {
      setError(t.errors.loadFailed);
      return;
    }

    if (data) {
      if (data.success) {
        setEntries(data.data?.history ?? []);
        setError("");
      } else {
        setEntries([]);
        setError(data.error ?? t.errors.generic);
      }
    }
  }, [data, swrError, t.errors.generic, t.errors.loadFailed]);

  if (loading) return <LoadingPage />;
  if (error) return <ErrorMessage message={error} />;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{username}</h1>
        <button
          type="button"
          onClick={() => {
            if (window.history.length > 1) {
              router.back();
            } else {
              router.push("/leaderboard/overall");
            }
          }}
          className="rounded-lg border border-card-border px-3 py-2 text-sm font-medium text-muted transition-colors hover:border-primary/40 hover:text-foreground"
        >
          {t.tutorial.back} ←
        </button>
      </header>

      <section>
        <h2 className="text-lg font-semibold">{t.profile.history}</h2>
        {entries.length === 0 ? (
          <p className="text-muted">{t.profile.noHistory}</p>
        ) : (
          <div className="space-y-4">
            {entries.map((entry) => (
              <PredictionHistoryCard
                key={entry.match.id}
                entry={entry}
                defaultOpen
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
