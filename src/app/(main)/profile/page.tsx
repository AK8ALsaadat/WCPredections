"use client";

import { useEffect, useMemo, useState } from "react";
import { clientFetch } from "@/lib/client-fetch";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { LoadingPage } from "@/components/ui/LoadingSpinner";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import dynamic from "next/dynamic";
const PredictionHistoryCard = dynamic(
  () => import("@/components/predictions/PredictionHistoryCard").then((m) => ({ default: m.PredictionHistoryCard })),
  { loading: () => <div /> }
);
import { buildMatchHistoryEntries } from "@/lib/profile-history";
import { formatDateShort } from "@/lib/utils";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import {
  isClientCacheFresh,
  readClientCache,
  writeClientCache,
} from "@/lib/client-page-cache";

type ProfileMatch = {
  id: string;
  matchTime: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  isKnockout: boolean;
  actualFinishType: string | null;
  penaltyWinnerTeamId: string | null;
  homeTeam: { id: string; name: string; shortName: string };
  awayTeam: { id: string; name: string; shortName: string };
  round: { id: string; name: string };
};

type ProfileData = {
  username: string;
  createdAt: string;
  totalPoints: number;
  predictionsCount: number;
  correctPredictions: number;
  history: {
    predictions: {
      id: string;
      predHome: number;
      predAway: number;
      isDouble: boolean;
      points: number;
      doubleBonus: number;
      finishTypePoints: number;
      penaltyWinnerPoints: number;
      predictedFinishType: string | null;
      predictedPenaltyWinnerTeamId: string | null;
      match: ProfileMatch;
    }[];
    scorerPredictions: {
      points: number;
      predictedGoals: number;
      player: { name: string };
      match: ProfileMatch;
    }[];
    boldScorerBets: {
      points: number;
      player: { name: string };
      match: ProfileMatch;
    }[];
  };
};

const PROFILE_CACHE_KEY = "profile";

export default function ProfilePage() {
  const { messages: t, locale } = useI18n();
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData | null>(() =>
    readClientCache<ProfileData>(PROFILE_CACHE_KEY)
  );
  const [loading, setLoading] = useState(
    () => !readClientCache<ProfileData>(PROFILE_CACHE_KEY)
  );
  const [error, setError] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [usernameSuccess, setUsernameSuccess] = useState("");
  const [savingUsername, setSavingUsername] = useState(false);

  const matchEntries = useMemo(
    () => (profile ? buildMatchHistoryEntries(profile.history) : []),
    [profile]
  );

  useEffect(() => {
    const cached = readClientCache<ProfileData>(PROFILE_CACHE_KEY);
    if (cached) {
      setProfile(cached);
      setNewUsername(cached.username);
      setLoading(false);
    }

    if (cached && isClientCacheFresh(PROFILE_CACHE_KEY)) {
      return;
    }

    void clientFetch("/api/profile")
      .then((r) => (r ? r.json() : null))
      .then((data) => {
        if (data && data.success) {
          writeClientCache(PROFILE_CACHE_KEY, data.data);
          setProfile(data.data);
          setNewUsername(data.data.username);
          setError("");
        } else if (!cached) {
          setError(data?.error ?? t.errors.loadFailed);
        }
      })
      .catch(() => {
        if (!cached) setError(t.errors.loadFailed);
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleUsernameSubmit(e: React.FormEvent) {
    e.preventDefault();
    setUsernameError("");
    setUsernameSuccess("");

    if (!profile) return;

    const trimmed = newUsername.trim();
    if (trimmed.toLowerCase() === profile.username.toLowerCase()) {
      setUsernameSuccess(t.profile.usernameUpdated);
      return;
    }

    setSavingUsername(true);

    try {
      const res = await clientFetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username: trimmed }),
      });

      const data = res ? await res.json() : null;
      if (!data.success) {
        const msg = data.error ?? "";
        setUsernameError(
          msg.includes("Username") ? t.profile.usernameInvalid : msg
        );
        return;
      }

      const updated = data.data.user.username as string;
      setProfile((prev) => {
        if (!prev) return prev;
        const next = { ...prev, username: updated };
        writeClientCache(PROFILE_CACHE_KEY, next);
        return next;
      });
      setNewUsername(updated);
      setUsernameSuccess(t.profile.usernameUpdated);
      router.refresh();
    } catch {
      setUsernameError(t.errors.generic);
    } finally {
      setSavingUsername(false);
    }
  }

  if (loading) return <LoadingPage />;
  if (error) return <ErrorMessage message={error} />;
  if (!profile) return null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">{profile.username}</h1>
        <p className="mt-1 text-muted">
          {t.profile.memberSince} {formatDateShort(profile.createdAt, locale)}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.profile.changeUsername}</CardTitle>
        </CardHeader>
        <form onSubmit={handleUsernameSubmit} className="space-y-4">
          <Input
            label={t.profile.newUsername}
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            autoComplete="username"
            maxLength={20}
            error={usernameError || undefined}
          />
          <p className="text-sm text-muted">{t.profile.usernameHint}</p>
          {usernameSuccess && (
            <div className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary">
              <p>{usernameSuccess}</p>
              <p className="mt-1 text-muted">{t.profile.usernameLoginNote}</p>
            </div>
          )}
          <Button
            type="submit"
            loading={savingUsername}
            disabled={!newUsername.trim()}
          >
            {t.profile.saveUsername}
          </Button>
        </form>
      </Card>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <p className="text-sm text-muted">{t.dashboard.totalPoints}</p>
          <p
            className={`text-2xl font-bold tabular-nums ${
              profile.totalPoints > 0
                ? "text-primary"
                : profile.totalPoints < 0
                  ? "text-danger"
                  : "text-muted"
            }`}
          >
            {profile.totalPoints}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted">{t.profile.predictions}</p>
          <p className="text-2xl font-bold">{profile.predictionsCount}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">{t.profile.correctScores}</p>
          <p className="text-2xl font-bold">{profile.correctPredictions}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">{t.profile.accuracy}</p>
          <p className="text-2xl font-bold">
            {profile.predictionsCount > 0
              ? `${Math.round((profile.correctPredictions / profile.predictionsCount) * 100)}%`
              : "—"}
          </p>
        </Card>
      </div>

      <section>
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-xl font-semibold">{t.profile.history}</h2>
          {matchEntries.length > 0 && (
            <Link href="/predictions" className="text-sm text-primary hover:underline">
              {t.profile.viewAllPredictions} →
            </Link>
          )}
        </div>
        {matchEntries.length === 0 ? (
          <Card>
            <p className="text-center text-muted">{t.profile.noHistory}</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {matchEntries.slice(0, 5).map((entry) => (
              <PredictionHistoryCard key={entry.match.id} entry={entry} />
            ))}
          </div>
        )}
      </section>

      <Link href="/leaderboard/overall" className="text-primary hover:underline">
        {t.leaderboard.overall} →
      </Link>
    </div>
  );
}
