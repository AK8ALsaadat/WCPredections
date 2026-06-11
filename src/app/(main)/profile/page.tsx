"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { LoadingPage } from "@/components/ui/LoadingSpinner";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { formatDateShort } from "@/lib/utils";
import Link from "next/link";
import { ar } from "@/lib/i18n/ar";
import {
  isClientCacheFresh,
  readClientCache,
  writeClientCache,
} from "@/lib/client-page-cache";

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
      finishTypePoints: number;
      penaltyWinnerPoints: number;
      match: {
        homeTeam: { shortName: string };
        awayTeam: { shortName: string };
        homeScore: number | null;
        awayScore: number | null;
        status: string;
        round: { id: string; name: string };
      };
    }[];
    scorerPredictions: {
      points: number;
      player: { name: string };
      match: {
        homeTeam: { shortName: string };
        awayTeam: { shortName: string };
        round: { name: string };
      };
    }[];
  };
};

const PROFILE_CACHE_KEY = "profile";

export default function ProfilePage() {
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

    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          writeClientCache(PROFILE_CACHE_KEY, data.data);
          setProfile(data.data);
          setNewUsername(data.data.username);
          setError("");
        } else if (!cached) {
          setError(data.error);
        }
      })
      .catch(() => {
        if (!cached) setError(ar.errors.loadFailed);
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
      setUsernameSuccess(ar.profile.usernameUpdated);
      return;
    }

    setSavingUsername(true);

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username: trimmed }),
      });

      const data = await res.json();
      if (!data.success) {
        const msg = data.error ?? "";
        setUsernameError(
          msg.includes("Username") ? ar.profile.usernameInvalid : msg
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
      setUsernameSuccess(ar.profile.usernameUpdated);
      router.refresh();
    } catch {
      setUsernameError(ar.errors.generic);
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
        <h1 className="text-3xl font-bold">@{profile.username}</h1>
        <p className="mt-1 text-muted">
          {ar.profile.memberSince} {formatDateShort(profile.createdAt)}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{ar.profile.changeUsername}</CardTitle>
        </CardHeader>
        <form onSubmit={handleUsernameSubmit} className="space-y-4">
          <Input
            label={ar.profile.newUsername}
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            autoComplete="username"
            maxLength={20}
            error={usernameError || undefined}
          />
          <p className="text-sm text-muted">{ar.profile.usernameHint}</p>
          {usernameSuccess && (
            <div className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary">
              <p>{usernameSuccess}</p>
              <p className="mt-1 text-muted">{ar.profile.usernameLoginNote}</p>
            </div>
          )}
          <Button
            type="submit"
            loading={savingUsername}
            disabled={!newUsername.trim()}
          >
            {ar.profile.saveUsername}
          </Button>
        </form>
      </Card>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <p className="text-sm text-muted">{ar.dashboard.totalPoints}</p>
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
          <p className="text-sm text-muted">{ar.profile.predictions}</p>
          <p className="text-2xl font-bold">{profile.predictionsCount}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">{ar.profile.correctScores}</p>
          <p className="text-2xl font-bold">{profile.correctPredictions}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">{ar.profile.accuracy}</p>
          <p className="text-2xl font-bold">
            {profile.predictionsCount > 0
              ? `${Math.round((profile.correctPredictions / profile.predictionsCount) * 100)}%`
              : "—"}
          </p>
        </Card>
      </div>

      <section>
        <h2 className="mb-4 text-xl font-semibold">{ar.profile.history}</h2>
        {profile.history.predictions.length === 0 ? (
          <Card>
            <p className="text-center text-muted">{ar.profile.noHistory}</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {profile.history.predictions.map((p) => {
              const totalPts = p.points + p.finishTypePoints + p.penaltyWinnerPoints;
              const isFinished = p.match.status === "FINISHED";

              return (
                <Card key={p.id} className="p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs text-muted">{p.match.round.name}</p>
                      <p className="font-medium">
                        {p.match.homeTeam.shortName} vs {p.match.awayTeam.shortName}
                      </p>
                      <p className="text-sm text-muted">
                        {ar.profile.predicted}: {p.predHome}-{p.predAway}
                        {p.isDouble && <span className="ml-1 text-warning">2x</span>}
                        {isFinished && (
                          <span className="ml-2">
                            {ar.profile.actual}: {p.match.homeScore}-{p.match.awayScore}
                          </span>
                        )}
                      </p>
                    </div>
                    {isFinished && (
                      <span
                        className={`text-lg font-bold ${totalPts > 0 ? "text-primary" : "text-muted"}`}
                      >
                        {totalPts} {ar.profile.pointsShort}
                      </span>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {profile.history.scorerPredictions.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-semibold">{ar.profile.scorerHistory}</h2>
          <div className="space-y-2">
            {profile.history.scorerPredictions.map((sp, i) => (
              <Card key={i} className="flex items-center justify-between p-4">
                <div>
                  <p className="text-xs text-muted">{sp.match.round.name}</p>
                  <p className="font-medium">{sp.player.name}</p>
                  <p className="text-sm text-muted">
                    {sp.match.homeTeam.shortName} vs {sp.match.awayTeam.shortName}
                  </p>
                </div>
                <span className={sp.points > 0 ? "text-primary font-bold" : "text-muted"}>
                  {sp.points} {ar.profile.pointsShort}
                </span>
              </Card>
            ))}
          </div>
        </section>
      )}

      <Link href="/leaderboard/overall" className="text-primary hover:underline">
        {ar.leaderboard.overall} →
      </Link>
    </div>
  );
}
