"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { LoadingPage } from "@/components/ui/LoadingSpinner";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { MatchPointsBreakdown } from "@/components/matches/MatchPointsBreakdown";
import { asFinishType } from "@/lib/finish-type";
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

function buildMatchHistoryEntries(history: ProfileData["history"]) {
  const byMatch = new Map<
    string,
    {
      match: ProfileMatch;
      prediction: ProfileData["history"]["predictions"][number] | null;
      scorers: ProfileData["history"]["scorerPredictions"];
      bold: ProfileData["history"]["boldScorerBets"][number] | null;
    }
  >();

  for (const prediction of history.predictions) {
    byMatch.set(prediction.match.id, {
      match: prediction.match,
      prediction,
      scorers: [],
      bold: null,
    });
  }

  for (const scorer of history.scorerPredictions) {
    const existing = byMatch.get(scorer.match.id) ?? {
      match: scorer.match,
      prediction: null,
      scorers: [],
      bold: null,
    };
    existing.scorers.push(scorer);
    byMatch.set(scorer.match.id, existing);
  }

  for (const bold of history.boldScorerBets) {
    const existing = byMatch.get(bold.match.id) ?? {
      match: bold.match,
      prediction: null,
      scorers: [],
      bold: null,
    };
    existing.bold = bold;
    byMatch.set(bold.match.id, existing);
  }

  return Array.from(byMatch.values()).sort(
    (a, b) =>
      new Date(b.match.matchTime).getTime() -
      new Date(a.match.matchTime).getTime()
  );
}

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
        <h1 className="text-3xl font-bold">@{profile.username}</h1>
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
        <h2 className="mb-4 text-xl font-semibold">{t.profile.history}</h2>
        {matchEntries.length === 0 ? (
          <Card>
            <p className="text-center text-muted">{t.profile.noHistory}</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {matchEntries.map((entry) => {
              const m = entry.match;
              const isFinished =
                m.status === "FINISHED" &&
                m.homeScore != null &&
                m.awayScore != null;
              const penaltyWinnerName =
                m.penaltyWinnerTeamId === m.homeTeam.id
                  ? m.homeTeam.name
                  : m.penaltyWinnerTeamId === m.awayTeam.id
                    ? m.awayTeam.name
                    : null;

              const breakdownInput =
                isFinished
                  ? {
                      homeScore: m.homeScore!,
                      awayScore: m.awayScore!,
                      isKnockout: m.isKnockout,
                      actualFinishType: asFinishType(m.actualFinishType),
                      penaltyWinnerTeamId: m.penaltyWinnerTeamId,
                      homeTeamName: m.homeTeam.name,
                      awayTeamName: m.awayTeam.name,
                      penaltyWinnerName,
                      userPrediction: entry.prediction
                        ? {
                            predHome: entry.prediction.predHome,
                            predAway: entry.prediction.predAway,
                            isDouble: entry.prediction.isDouble,
                            points: entry.prediction.points,
                            finishTypePoints: entry.prediction.finishTypePoints,
                            penaltyWinnerPoints:
                              entry.prediction.penaltyWinnerPoints,
                            predictedFinishType: asFinishType(
                              entry.prediction.predictedFinishType
                            ),
                            predictedPenaltyWinnerTeamId:
                              entry.prediction.predictedPenaltyWinnerTeamId,
                          }
                        : null,
                      userScorerPredictions: entry.scorers.map((sp) => ({
                        predictedGoals: sp.predictedGoals,
                        points: sp.points,
                        player: { name: sp.player.name },
                      })),
                      userBoldScorerBet: entry.bold
                        ? {
                            points: entry.bold.points,
                            player: { name: entry.bold.player.name },
                          }
                        : null,
                    }
                  : null;

              return (
                <Card key={m.id} className="p-4">
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs text-muted">{m.round.name}</p>
                      <Link
                        href={`/matches/${m.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {m.homeTeam.shortName} vs {m.awayTeam.shortName}
                      </Link>
                      {entry.prediction && (
                        <p className="mt-1 text-sm text-muted">
                          {t.profile.predicted}: {entry.prediction.predHome}-
                          {entry.prediction.predAway}
                          {entry.prediction.isDouble && (
                            <span className="ml-1 text-warning">2×</span>
                          )}
                        </p>
                      )}
                      {isFinished && (
                        <p className="text-sm text-muted">
                          {t.profile.actual}: {m.homeScore}-{m.awayScore}
                        </p>
                      )}
                    </div>
                  </div>

                  {breakdownInput && (
                    <MatchPointsBreakdown {...breakdownInput} compact />
                  )}

                  {!isFinished && entry.prediction && (
                    <p className="text-sm text-muted">{t.status[m.status as keyof typeof t.status]}</p>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <Link href="/leaderboard/overall" className="text-primary hover:underline">
        {t.leaderboard.overall} →
      </Link>
    </div>
  );
}
