"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { PredictionCountdown } from "@/components/matches/PredictionCountdown";
import { PitchLineup } from "@/components/predict/PitchLineup";
import { clientFetch, isAbortError } from "@/lib/client-fetch";
import { formatDate, isPredictionAllowed, getPredictionLockReason } from "@/lib/utils";
import { ar } from "@/lib/i18n/ar";
import {
  buildPlayerTeamSets,
  getScorerBudgetStatus,
  picksToArray,
  type ScorerPicks,
} from "@/lib/scorer-prediction";
import type {
  LineupSource,
  MatchPlayerView,
} from "@/services/match-players.service";

const LINEUP_REFRESH_MS = 180_000;

type MatchData = {
  id: string;
  matchTime: string;
  isKnockout: boolean;
  homeTeam: { id: string; name: string; shortName: string; logoUrl?: string | null };
  awayTeam: { id: string; name: string; shortName: string; logoUrl?: string | null };
  userPrediction: {
    predHome: number;
    predAway: number;
    isDouble: boolean;
    predictedFinishType: string | null;
    predictedPenaltyWinnerTeamId: string | null;
  } | null;
  userScorerPredictions: { playerId: string; predictedGoals: number }[];
  userBoldScorerBet?: {
    playerId: string;
    points: number;
    player: { name: string };
  } | null;
  boldScorerRoundStatus?: {
    used: boolean;
    onThisMatch: boolean;
    onOtherMatch: boolean;
    otherMatchId: string | null;
  } | null;
  roundUsageLimits?: {
    roundId: string;
    doubles: {
      used: number;
      max: number;
      onThisMatch: boolean;
      canEnable: boolean;
      remaining: number;
    };
    boldScorer: {
      used: boolean;
      max: number;
      onThisMatch: boolean;
      onOtherMatch: boolean;
      canUse: boolean;
      otherMatchId: string | null;
      playerName: string | null;
    };
  } | null;
};

type LineupData = {
  homePlayers: MatchPlayerView[];
  awayPlayers: MatchPlayerView[];
  homeFormation?: string | null;
  awayFormation?: string | null;
  homeLineupSource?: LineupSource;
  awayLineupSource?: LineupSource;
  lineupStatus?: LineupSource;
  homeTeamName: string;
  awayTeamName: string;
  homeShortName: string;
  awayShortName: string;
};

export default function PredictPage() {
  const params = useParams();
  const router = useRouter();
  const matchId = params.matchId as string;

  const [match, setMatch] = useState<MatchData | null>(null);
  const [lineup, setLineup] = useState<LineupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lineupLoading, setLineupLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [predHome, setPredHome] = useState(0);
  const [predAway, setPredAway] = useState(0);
  const [isDouble, setIsDouble] = useState(false);
  const [finishType, setFinishType] = useState("");
  const [penaltyWinner, setPenaltyWinner] = useState("");
  const [scorerPicks, setScorerPicks] = useState<ScorerPicks>({});
  const [boldPlayerId, setBoldPlayerId] = useState<string>("");

  const teamSets = useMemo(() => {
    if (!lineup) return { home: new Set<string>(), away: new Set<string>() };
    return buildPlayerTeamSets(lineup);
  }, [lineup]);

  const budget = useMemo(
    () =>
      getScorerBudgetStatus(
        scorerPicks,
        teamSets.home,
        teamSets.away,
        predHome,
        predAway
      ),
    [scorerPicks, teamSets, predHome, predAway]
  );

  const hasAnyGoals = predHome > 0 || predAway > 0;
  const scorerCount = Object.keys(scorerPicks).length;

  useEffect(() => {
    const abort = new AbortController();
    let initial = true;
    let cancelled = false;

    async function loadLineup(silent = false) {
      if (cancelled) return;
      if (!silent) setLineupLoading(true);
      try {
        const res = await clientFetch(`/api/matches/${matchId}/lineup`, {
          signal: abort.signal,
        });
        if (!res) return;
        const data = await res.json();
        if (cancelled) return;
        if (data.success) {
          setLineup(data.data as LineupData);
        }
      } catch (err) {
        if (isAbortError(err) || cancelled) return;
      } finally {
        if (!cancelled && !silent) setLineupLoading(false);
      }
    }

    async function loadMatch() {
      try {
        const res = await clientFetch(`/api/matches/${matchId}`, {
          signal: abort.signal,
        });
        if (!res) {
          if (!cancelled) setError(ar.errors.loadFailed);
          return;
        }

        const data = await res.json();
        if (cancelled) return;

        if (!data.success) {
          setError(data.error);
          return;
        }

        const m = data.data as MatchData;
        setMatch(m);
        setError("");

        if (initial) {
          if (m.userPrediction) {
            setPredHome(m.userPrediction.predHome);
            setPredAway(m.userPrediction.predAway);
            setIsDouble(m.userPrediction.isDouble);
            setFinishType(m.userPrediction.predictedFinishType ?? "");
            setPenaltyWinner(m.userPrediction.predictedPenaltyWinnerTeamId ?? "");
          }
          if (m.userScorerPredictions?.length) {
            const picks: ScorerPicks = {};
            for (const sp of m.userScorerPredictions) {
              picks[sp.playerId] = sp.predictedGoals ?? 1;
            }
            setScorerPicks(picks);
          }
          if (m.userBoldScorerBet?.playerId) {
            setBoldPlayerId(m.userBoldScorerBet.playerId);
          }
        }
      } catch (err) {
        if (!isAbortError(err) && !cancelled) {
          setError(ar.errors.loadFailed);
        }
      } finally {
        if (initial && !cancelled) {
          initial = false;
          setLoading(false);
        }
      }
    }

    void loadMatch();
    void loadLineup();

    const interval = setInterval(() => {
      void loadLineup(true);
    }, LINEUP_REFRESH_MS);

    return () => {
      cancelled = true;
      abort.abort();
      clearInterval(interval);
    };
  }, [matchId]);

  function toggleScorer(playerId: string) {
    setScorerPicks((prev) => {
      if (playerId in prev) {
        const next = { ...prev };
        delete next[playerId];
        return next;
      }
      return { ...prev, [playerId]: 1 };
    });
  }

  function setScorerGoals(playerId: string, goals: number) {
    setScorerPicks((prev) => {
      if (!(playerId in prev)) return prev;
      return { ...prev, [playerId]: Math.max(1, Math.min(9, goals)) };
    });
  }

  function handleDoubleToggle(checked: boolean) {
    const limits = match?.roundUsageLimits?.doubles;
    if (checked && limits && !limits.canEnable && !limits.onThisMatch) {
      setError(ar.predict.doubleExhausted);
      return;
    }
    setError("");
    setIsDouble(checked);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const doubleLimits = match?.roundUsageLimits?.doubles;
    if (
      isDouble &&
      doubleLimits &&
      !doubleLimits.canEnable &&
      !doubleLimits.onThisMatch
    ) {
      setError(ar.predict.doubleExhausted);
      return;
    }

    if (budget.anyExceeded) {
      setError(ar.predict.scorersExceeded);
      return;
    }

    if (hasAnyGoals && scorerCount === 0) {
      setError(
        hasPlayers ? ar.predict.scorersRequired : ar.predict.scorersNeedLineup
      );
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId,
          predHome,
          predAway,
          isDouble,
          predictedFinishType: finishType || null,
          predictedPenaltyWinnerTeamId: penaltyWinner || null,
          picks: picksToArray(scorerPicks),
          boldPlayerId: boldPlayerId || null,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        setError(data.error);
        return;
      }

      setSuccess(ar.matches.predictionSubmitted);
      setTimeout(() => router.push(`/matches/${matchId}`), 1500);
    } catch {
      setError(ar.errors.generic);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error && !match) return <ErrorMessage message={error} />;
  if (!match) return <ErrorMessage message={ar.errors.loadFailed} />;

  const lockReason = getPredictionLockReason(match.matchTime);
  if (!isPredictionAllowed(match.matchTime)) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <ErrorMessage message={`${ar.matches.locked} — ${lockReason}`} />
        <Link href={`/matches/${matchId}`} className="text-primary hover:underline">
          {ar.matches.back}
        </Link>
      </div>
    );
  }

  const hasPlayers =
    (lineup?.homePlayers.length ?? 0) > 0 ||
    (lineup?.awayPlayers.length ?? 0) > 0;
  const needsLineupForScorers = hasAnyGoals && !hasPlayers;

  const doubleLimits = match.roundUsageLimits?.doubles;
  const boldLimits = match.roundUsageLimits?.boldScorer;
  const boldLockedOnOther =
    boldLimits?.onOtherMatch ??
    match.boldScorerRoundStatus?.onOtherMatch ??
    false;
  const doubleCheckboxDisabled =
    doubleLimits != null &&
    !doubleLimits.canEnable &&
    !doubleLimits.onThisMatch;
  const allLineupPlayers = [
    ...(lineup?.homePlayers ?? []).map((p) => ({
      ...p,
      teamShort: match.homeTeam.shortName,
    })),
    ...(lineup?.awayPlayers ?? []).map((p) => ({
      ...p,
      teamShort: match.awayTeam.shortName,
    })),
  ];

  const boldPlayerGroups =
    lineup && hasPlayers
      ? [
          {
            label: match.homeTeam.name,
            options: lineup.homePlayers.map((player) => ({
              value: player.id,
              label:
                player.section === "bench"
                  ? `${player.name} (${ar.predict.scorerBench})`
                  : player.name,
            })),
          },
          {
            label: match.awayTeam.name,
            options: lineup.awayPlayers.map((player) => ({
              value: player.id,
              label:
                player.section === "bench"
                  ? `${player.name} (${ar.predict.scorerBench})`
                  : player.name,
            })),
          },
        ]
      : undefined;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href={`/matches/${matchId}`} className="text-sm text-primary hover:underline">
        {ar.matches.back}
      </Link>

      <Card>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <TeamLogo {...match.homeTeam} />
            <span className="font-medium">{match.homeTeam.shortName}</span>
          </div>
          <span className="text-muted">{ar.matches.vs}</span>
          <div className="flex items-center gap-2">
            <span className="font-medium">{match.awayTeam.shortName}</span>
            <TeamLogo {...match.awayTeam} />
          </div>
        </div>
        <p className="mt-2 text-center text-sm text-muted">{formatDate(match.matchTime)}</p>
        <div className="mt-4">
          <PredictionCountdown
            matchTime={match.matchTime}
            variant="prominent"
          />
        </div>
      </Card>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && <ErrorMessage message={error} />}
        {success && (
          <div className="rounded-lg border border-primary/50 bg-primary/10 px-4 py-3 text-sm text-primary">
            {success}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{ar.predict.scorePrediction}</CardTitle>
          </CardHeader>
          <div className="flex items-end justify-center gap-4">
            <Input
              label={match.homeTeam.shortName}
              type="number"
              min={0}
              max={20}
              value={predHome}
              onChange={(e) => setPredHome(parseInt(e.target.value) || 0)}
              className="w-20 text-center text-2xl font-bold"
            />
            <span className="pb-3 text-2xl text-muted">-</span>
            <Input
              label={match.awayTeam.shortName}
              type="number"
              min={0}
              max={20}
              value={predAway}
              onChange={(e) => setPredAway(parseInt(e.target.value) || 0)}
              className="w-20 text-center text-2xl font-bold"
            />
          </div>
          <p className="mt-3 text-center text-sm text-muted">
            {ar.predict.scoreFirstHint}
          </p>

          <div className="mt-4 space-y-3">
            {doubleLimits && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
                <span className="font-semibold text-warning">
                  {ar.predict.doubleCounter(
                    doubleLimits.used,
                    doubleLimits.max
                  )}
                </span>
                {doubleLimits.onThisMatch ? (
                  <span className="text-warning">
                    {ar.predict.doubleOnThisMatch}
                  </span>
                ) : doubleLimits.remaining > 0 ? (
                  <span className="text-muted">
                    {ar.predict.doubleRemaining(doubleLimits.remaining)}
                  </span>
                ) : (
                  <span className="text-danger">
                    {ar.predict.doubleExhausted}
                  </span>
                )}
              </div>
            )}

            <label
              className={`flex items-center gap-3 rounded-lg border p-4 transition-colors ${
                doubleCheckboxDisabled
                  ? "cursor-not-allowed border-card-border/60 opacity-60"
                  : "cursor-pointer border-card-border hover:border-warning/50"
              }`}
            >
              <input
                type="checkbox"
                checked={isDouble}
                disabled={doubleCheckboxDisabled}
                onChange={(e) => handleDoubleToggle(e.target.checked)}
                className="h-5 w-5 rounded accent-warning disabled:cursor-not-allowed"
              />
              <div>
                <p className="font-medium text-warning">
                  {ar.predict.doublePoints}
                </p>
                <p className="text-sm text-muted">{ar.predict.doubleHint}</p>
              </div>
            </label>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{ar.predict.boldScorerBet.title}</CardTitle>
          </CardHeader>
          <p className="mb-4 text-sm text-muted">
            {ar.predict.boldScorerBet.hint}
          </p>

          {boldLimits && (
            <div
              className={`mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
                boldLimits.used
                  ? "border-warning/40 bg-warning/10 text-warning"
                  : "border-primary/30 bg-primary/10 text-primary"
              }`}
            >
              <span className="font-semibold">
                {ar.predict.boldCounter(
                  boldLimits.used ? boldLimits.max : 0,
                  boldLimits.max
                )}
              </span>
              <span>
                {boldLimits.onThisMatch && boldLimits.playerName
                  ? ar.predict.boldUsedHere(boldLimits.playerName)
                  : boldLimits.onOtherMatch
                    ? ar.predict.boldExhausted
                    : ar.predict.boldAvailable}
              </span>
            </div>
          )}

          {lineupLoading ? (
            <p className="py-4 text-center text-sm text-muted">
              {ar.predict.lineupLoading}
            </p>
          ) : !hasPlayers ? (
            <p className="py-4 text-center text-sm text-muted">
              {ar.predict.lineupUnavailable}
            </p>
          ) : boldLockedOnOther ? (
            <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
              <p>{ar.predict.boldScorerBet.usedElsewhere}</p>
              {match.boldScorerRoundStatus?.otherMatchId && (
                <Link
                  href={`/matches/${match.boldScorerRoundStatus.otherMatchId}`}
                  className="mt-2 inline-block font-medium text-primary hover:underline"
                >
                  {ar.predict.boldScorerBet.viewOtherMatch}
                </Link>
              )}
            </div>
          ) : (
            <Select
              label={ar.predict.boldScorerBet.selectPlayer}
              value={boldPlayerId}
              onChange={(e) => setBoldPlayerId(e.target.value)}
              options={[{ value: "", label: ar.predict.boldScorerBet.none }]}
              groups={boldPlayerGroups}
            />
          )}

          {boldPlayerId && !boldLockedOnOther && hasPlayers && (
            <p className="mt-3 text-sm font-medium text-warning">
              {ar.predict.boldScorerBet.selected(
                allLineupPlayers.find((p) => p.id === boldPlayerId)?.name ?? ""
              )}
            </p>
          )}
        </Card>

        {match.isKnockout && (
          <Card>
            <CardHeader>
              <CardTitle>{ar.predict.knockout}</CardTitle>
            </CardHeader>
            <Select
              label={ar.predict.finishTypeLabel}
              value={finishType}
              onChange={(e) => setFinishType(e.target.value)}
              options={[
                { value: "", label: ar.predict.selectFinish },
                { value: "NINETY_MINUTES", label: ar.predict.ninety },
                { value: "EXTRA_TIME", label: ar.predict.extraTime },
                { value: "PENALTIES", label: ar.predict.penalties },
              ]}
            />

            {finishType === "PENALTIES" && (
              <div className="mt-4">
                <Select
                  label={ar.predict.penaltyWinner}
                  value={penaltyWinner}
                  onChange={(e) => setPenaltyWinner(e.target.value)}
                  options={[
                    { value: "", label: ar.predict.selectWinner },
                    { value: match.homeTeam.id, label: match.homeTeam.name },
                    { value: match.awayTeam.id, label: match.awayTeam.name },
                  ]}
                />
              </div>
            )}
          </Card>
        )}

        <Card>
          {lineupLoading ? (
            <div className="py-16">
              <LoadingSpinner />
              <p className="mt-3 text-center text-sm text-muted">
                {ar.predict.lineupLoading}
              </p>
            </div>
          ) : hasPlayers && lineup ? (
            <>
              {hasAnyGoals && (
                <div className="mb-4 grid gap-2 sm:grid-cols-2">
                  <div
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      budget.homeExceeded
                        ? "border-danger/50 bg-danger/10 text-danger"
                        : "border-card-border bg-card text-muted"
                    }`}
                  >
                    <span className="font-medium text-foreground">
                      {match.homeTeam.shortName}:{" "}
                    </span>
                    {budget.homeTotal} / {predHome} {ar.predict.goalsUnit}
                    {budget.homeExceeded && (
                      <span className="mr-1 font-bold"> — {ar.predict.exceeded}</span>
                    )}
                  </div>
                  <div
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      budget.awayExceeded
                        ? "border-danger/50 bg-danger/10 text-danger"
                        : "border-card-border bg-card text-muted"
                    }`}
                  >
                    <span className="font-medium text-foreground">
                      {match.awayTeam.shortName}:{" "}
                    </span>
                    {budget.awayTotal} / {predAway} {ar.predict.goalsUnit}
                    {budget.awayExceeded && (
                      <span className="mr-1 font-bold"> — {ar.predict.exceeded}</span>
                    )}
                  </div>
                </div>
              )}

              {budget.anyExceeded && (
                <div className="mb-4 rounded-lg border border-danger/50 bg-danger/10 px-4 py-3 text-sm text-danger">
                  {ar.predict.scorersExceeded}
                </div>
              )}

              <PitchLineup
                home={{
                  teamName: lineup.homeTeamName,
                  shortName: lineup.homeShortName,
                  formation: lineup.homeFormation,
                  players: lineup.homePlayers,
                  source: lineup.homeLineupSource ?? "estimated",
                }}
                away={{
                  teamName: lineup.awayTeamName,
                  shortName: lineup.awayShortName,
                  formation: lineup.awayFormation,
                  players: lineup.awayPlayers,
                  source: lineup.awayLineupSource ?? "estimated",
                }}
                lineupStatus={lineup.lineupStatus ?? "estimated"}
                scorerPicks={scorerPicks}
                onToggle={toggleScorer}
                onGoalsChange={setScorerGoals}
                labels={{
                  title: ar.predict.scorerPrediction,
                  hint: hasAnyGoals
                    ? ar.predict.scorerHint
                    : ar.predict.scorerHintNoGoals,
                  bench: ar.predict.scorerBench,
                  formation: ar.predict.scorerFormation,
                  officialBadge: ar.predict.scorerOfficialBadge,
                  probableBadge: ar.predict.scorerProbableBadge,
                  estimatedBadge: ar.predict.scorerEstimatedBadge,
                  officialNote: ar.predict.scorerOfficialNote,
                  probableNote: ar.predict.scorerProbableNote,
                  estimatedNote: ar.predict.scorerEstimatedNote,
                  selectedScorers: ar.predict.selectedScorers,
                  goalsLabel: ar.predict.goalsLabel,
                  remove: ar.predict.removeScorer,
                }}
              />
            </>
          ) : (
            <p className="py-8 text-center text-sm text-muted">
              {ar.predict.lineupUnavailable}
            </p>
          )}
        </Card>

        <Button
          type="submit"
          className="w-full"
          size="lg"
          loading={submitting}
          disabled={budget.anyExceeded || needsLineupForScorers}
        >
          {ar.predict.submit}
        </Button>
      </form>
    </div>
  );
}
