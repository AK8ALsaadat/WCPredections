"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { PredictPageSkeleton } from "@/components/predict/PredictPageSkeleton";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { PredictionCountdown } from "@/components/matches/PredictionCountdown";
import { clientFetch, isAbortError } from "@/lib/client-fetch";
import {
  invalidateMatchesListCaches,
  invalidatePredictCaches,
  isPredictLineupCacheFresh,
  isPredictMatchCacheFresh,
  readPredictLineupCache,
  readPredictMatchCache,
  writePredictLineupCache,
  writePredictMatchCache,
} from "@/lib/predict-prefetch";
import {
  cn,
  formatDate,
  isPredictionAllowed,
  getPredictionLockReason,
} from "@/lib/utils";
import { useI18n } from "@/lib/i18n/LocaleProvider";
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

const LINEUP_REFRESH_MS = 60_000;
const LINEUP_REFRESH_PROBABLE_MS = 45_000;

const PitchLineup = dynamic(
  () =>
    import("@/components/predict/PitchLineup").then((mod) => ({
      default: mod.PitchLineup,
    })),
  {
    loading: () => (
      <div className="py-12">
        <LoadingSpinner />
      </div>
    ),
  }
);

type MatchData = {
  id: string;
  matchTime: string;
  status?: string;
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

type FormState = {
  predHome: number;
  predAway: number;
  isDouble: boolean;
  finishType: string;
  penaltyWinner: string;
  scorerPicks: ScorerPicks;
  boldPlayerId: string;
  boldEnabled: boolean;
};

const EMPTY_FORM: FormState = {
  predHome: 0,
  predAway: 0,
  isDouble: false,
  finishType: "",
  penaltyWinner: "",
  scorerPicks: {},
  boldPlayerId: "",
  boldEnabled: false,
};

function formStateFromMatch(m: MatchData | null): FormState {
  if (!m) return EMPTY_FORM;

  const state = { ...EMPTY_FORM };
  if (m.userPrediction) {
    state.predHome = m.userPrediction.predHome;
    state.predAway = m.userPrediction.predAway;
    state.isDouble = m.userPrediction.isDouble;
    state.finishType = m.userPrediction.predictedFinishType ?? "";
    state.penaltyWinner = m.userPrediction.predictedPenaltyWinnerTeamId ?? "";
  }
  if (m.userScorerPredictions?.length) {
    for (const sp of m.userScorerPredictions) {
      state.scorerPicks[sp.playerId] = sp.predictedGoals ?? 1;
    }
  }
  if (m.userBoldScorerBet?.playerId) {
    state.boldPlayerId = m.userBoldScorerBet.playerId;
    state.boldEnabled = true;
  }
  return state;
}

function applySavedPrediction(m: MatchData, setters: {
  setPredHome: (v: number) => void;
  setPredAway: (v: number) => void;
  setIsDouble: (v: boolean) => void;
  setFinishType: (v: string) => void;
  setPenaltyWinner: (v: string) => void;
  setScorerPicks: (v: ScorerPicks) => void;
  setBoldPlayerId: (v: string) => void;
  setBoldEnabled: (v: boolean) => void;
}) {
  const state = formStateFromMatch(m);
  setters.setPredHome(state.predHome);
  setters.setPredAway(state.predAway);
  setters.setIsDouble(state.isDouble);
  setters.setFinishType(state.finishType);
  setters.setPenaltyWinner(state.penaltyWinner);
  setters.setScorerPicks(state.scorerPicks);
  setters.setBoldPlayerId(state.boldPlayerId);
  setters.setBoldEnabled(state.boldEnabled);
}

export default function PredictPage() {
  const { messages: t, locale } = useI18n();
  const params = useParams();
  const router = useRouter();
  const matchId = params.matchId as string;

  const [match, setMatch] = useState<MatchData | null>(() =>
    readPredictMatchCache<MatchData>(matchId)
  );
  const [lineup, setLineup] = useState<LineupData | null>(() =>
    readPredictLineupCache<LineupData>(matchId)
  );
  const [loading, setLoading] = useState(
    () => !readPredictMatchCache<MatchData>(matchId)
  );
  const [lineupLoading, setLineupLoading] = useState(
    () => !readPredictLineupCache<LineupData>(matchId)
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const initialForm = formStateFromMatch(
    readPredictMatchCache<MatchData>(matchId)
  );
  const [predHome, setPredHome] = useState(initialForm.predHome);
  const [predAway, setPredAway] = useState(initialForm.predAway);
  const [isDouble, setIsDouble] = useState(initialForm.isDouble);
  const [finishType, setFinishType] = useState(initialForm.finishType);
  const [penaltyWinner, setPenaltyWinner] = useState(initialForm.penaltyWinner);
  const [scorerPicks, setScorerPicks] = useState<ScorerPicks>(
    initialForm.scorerPicks
  );
  const [boldEnabled, setBoldEnabled] = useState(initialForm.boldEnabled);
  const [boldPlayerId, setBoldPlayerId] = useState(initialForm.boldPlayerId);

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
    const cachedMatch = readPredictMatchCache<MatchData>(matchId);
    const cachedLineup = readPredictLineupCache<LineupData>(matchId);

    setMatch(cachedMatch);
    setLineup(cachedLineup);
    setLoading(!cachedMatch);
    setLineupLoading(!cachedLineup);
    setError("");
    setSuccess("");

    if (cachedMatch) {
      applySavedPrediction(cachedMatch, {
        setPredHome,
        setPredAway,
        setIsDouble,
        setFinishType,
        setPenaltyWinner,
        setScorerPicks,
        setBoldPlayerId,
        setBoldEnabled,
      });
    } else {
      setPredHome(0);
      setPredAway(0);
      setIsDouble(false);
      setFinishType("");
      setPenaltyWinner("");
      setScorerPicks({});
      setBoldPlayerId("");
      setBoldEnabled(false);
    }
  }, [matchId]);

  useEffect(() => {
    const abort = new AbortController();
    let cancelled = false;

    async function loadLineup(silent = false) {
      if (cancelled) return;
      if (!silent && !readPredictLineupCache(matchId)) setLineupLoading(true);

      const cachedLineup = readPredictLineupCache<LineupData>(matchId);
      if (
        !silent &&
        isPredictLineupCacheFresh(matchId) &&
        cachedLineup?.lineupStatus === "official"
      ) {
        setLineupLoading(false);
        return;
      }

      const needsFresh =
        silent || !cachedLineup || cachedLineup.lineupStatus !== "official";

      try {
        const res = await clientFetch(
          `/api/matches/${matchId}/lineup${needsFresh ? "?fresh=1" : ""}`,
          {
            signal: abort.signal,
          }
        );
        if (!res) return;
        const data = await res.json();
        if (cancelled) return;
        if (data.success) {
          const payload = data.data as LineupData;
          writePredictLineupCache(matchId, payload);
          setLineup(payload);
        }
      } catch (err) {
        if (isAbortError(err) || cancelled) return;
      } finally {
        if (!cancelled) setLineupLoading(false);
      }
    }

    async function loadMatch() {
      if (cancelled) return;

      const cached = readPredictMatchCache<MatchData>(matchId);
      if (cached && isPredictMatchCacheFresh(matchId)) {
        setLoading(false);
        return;
      }

      if (!cached) setLoading(true);

      try {
        const res = await clientFetch(`/api/matches/${matchId}?predict=true`, {
          signal: abort.signal,
        });
        if (!res) {
          if (!cancelled && !cached) setError(t.errors.loadFailed);
          return;
        }

        const data = await res.json();
        if (cancelled) return;

        if (!data.success) {
          if (!cached) setError(data.error);
          return;
        }

        const payload = data.data as MatchData;
        writePredictMatchCache(matchId, { ...payload, _complete: true });
        setMatch(payload);
        setError("");

        applySavedPrediction(payload, {
          setPredHome,
          setPredAway,
          setIsDouble,
          setFinishType,
          setPenaltyWinner,
          setScorerPicks,
          setBoldPlayerId,
          setBoldEnabled,
        });
      } catch (err) {
        if (!isAbortError(err) && !cancelled && !cached) {
          setError(t.errors.loadFailed);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadMatch();
    void loadLineup();

    return () => {
      cancelled = true;
      abort.abort();
    };
  }, [matchId]);

  useEffect(() => {
    const refreshMs =
      lineup?.lineupStatus === "official"
        ? LINEUP_REFRESH_MS
        : LINEUP_REFRESH_PROBABLE_MS;
    const interval = setInterval(() => {
      void (async () => {
        const cachedLineup = readPredictLineupCache<LineupData>(matchId);
        const needsFresh =
          !cachedLineup || cachedLineup.lineupStatus !== "official";
        try {
          const res = await clientFetch(
            `/api/matches/${matchId}/lineup${needsFresh ? "?fresh=1" : ""}`
          );
          if (!res) return;
          const data = await res.json();
          if (data.success) {
            const payload = data.data as LineupData;
            writePredictLineupCache(matchId, payload);
            setLineup(payload);
          }
        } catch {
          /* ignore poll errors */
        }
      })();
    }, refreshMs);
    return () => clearInterval(interval);
  }, [matchId, lineup?.lineupStatus]);

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
    if (match?.userPrediction?.isDouble && !checked) {
      setError(t.predict.doubleLocked);
      return;
    }
    const limits = match?.roundUsageLimits?.doubles;
    if (checked && limits && !limits.canEnable && !limits.onThisMatch) {
      setError(t.predict.doubleExhausted);
      return;
    }
    setError("");
    setIsDouble(checked);
  }

  function handleBoldToggle(checked: boolean) {
    if (match?.userBoldScorerBet?.playerId && !checked) {
      setError(t.predict.boldLocked);
      return;
    }
    const limits = match?.roundUsageLimits?.boldScorer;
    if (checked && limits && !limits.canUse && !limits.onThisMatch) {
      setError(t.predict.boldExhausted);
      return;
    }
    setError("");
    setBoldEnabled(checked);
    if (!checked) setBoldPlayerId("");
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
      setError(t.predict.doubleExhausted);
      return;
    }

    if (budget.anyExceeded) {
      setError(t.predict.scorersExceeded);
      return;
    }

    if (hasAnyGoals && scorerCount === 0) {
      setError(
        hasPlayers ? t.predict.scorersRequired : t.predict.scorersNeedLineup
      );
      return;
    }

    if (boldEnabled && !boldPlayerId) {
      setError(t.predict.boldScorerBet.choosePlayerRequired);
      return;
    }

    if (match?.isKnockout && !finishType) {
      setError(t.predict.selectFinish);
      return;
    }

    if (
      match?.isKnockout &&
      finishType === "PENALTIES" &&
      !penaltyWinner
    ) {
      setError(t.predict.selectWinner);
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
          boldPlayerId: boldEnabled ? boldPlayerId || null : null,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        setError(data.error);
        return;
      }

      invalidatePredictCaches(matchId);
      invalidateMatchesListCaches();
      setSuccess(t.matches.predictionSubmitted);
      setTimeout(() => router.push(`/matches/${matchId}`), 1500);
    } catch {
      setError(t.errors.generic);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading && !match) {
    return <PredictPageSkeleton />;
  }

  if (error && !match) return <ErrorMessage message={error} />;
  if (!match) return <ErrorMessage message={t.errors.loadFailed} />;

  const lockReason = getPredictionLockReason(match.matchTime, match.status, t);
  if (!isPredictionAllowed(match.matchTime, match.status)) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <ErrorMessage message={`${t.matches.locked} — ${lockReason}`} />
        <Link href={`/matches/${matchId}`} className="text-primary hover:underline">
          {t.matches.back}
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
  const doubleCommitted = match.userPrediction?.isDouble === true;
  const boldCommitted = !!match.userBoldScorerBet?.playerId;
  const boldLockedOnOther =
    boldLimits?.onOtherMatch ??
    match.boldScorerRoundStatus?.onOtherMatch ??
    false;
  const boldCheckboxDisabled =
    boldCommitted ||
    (boldLimits != null && !boldLimits.canUse && !boldLimits.onThisMatch);
  const doubleCheckboxDisabled =
    doubleCommitted ||
    (doubleLimits != null &&
      !doubleLimits.canEnable &&
      !doubleLimits.onThisMatch);
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
                  ? `${player.name} (${t.predict.scorerBench})`
                  : player.name,
            })),
          },
          {
            label: match.awayTeam.name,
            options: lineup.awayPlayers.map((player) => ({
              value: player.id,
              label:
                player.section === "bench"
                  ? `${player.name} (${t.predict.scorerBench})`
                  : player.name,
            })),
          },
        ]
      : undefined;

  const boldSelectOptions = [
    { value: "", label: t.predict.boldScorerBet.choosePlayer },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href={`/matches/${matchId}`} className="text-sm text-primary hover:underline">
        {t.matches.back}
      </Link>

      <Card>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <TeamLogo {...match.homeTeam} />
            <span className="font-medium">{match.homeTeam.shortName}</span>
          </div>
          <span className="text-muted">{t.matches.vs}</span>
          <div className="flex items-center gap-2">
            <span className="font-medium">{match.awayTeam.shortName}</span>
            <TeamLogo {...match.awayTeam} />
          </div>
        </div>
        <p className="mt-2 text-center text-sm text-muted">
          {formatDate(match.matchTime, locale)}
        </p>
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
            <CardTitle>{t.predict.scorePrediction}</CardTitle>
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
            {t.predict.scoreFirstHint}
          </p>

          <div className="mt-4 space-y-3">
            {doubleLimits && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
                <span className="font-semibold text-warning">
                  {t.predict.doubleCounter(
                    doubleLimits.used,
                    doubleLimits.max
                  )}
                </span>
                {doubleLimits.onThisMatch ? (
                  <span className="text-warning">
                    {t.predict.doubleOnThisMatch}
                  </span>
                ) : doubleLimits.remaining > 0 ? (
                  <span className="text-muted">
                    {t.predict.doubleRemaining(doubleLimits.remaining)}
                  </span>
                ) : (
                  <span className="text-danger">
                    {t.predict.doubleExhausted}
                  </span>
                )}
              </div>
            )}

            <label
              className={`flex items-center gap-3 rounded-lg border p-4 transition-colors ${
                doubleCheckboxDisabled
                  ? "cursor-not-allowed border-card-border/60 opacity-60"
                  : "cursor-pointer border-card-border hover:border-warning/50"
              } ${doubleCommitted ? "border-warning/40 bg-warning/10" : ""}`}
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
                  {t.predict.doublePoints}
                </p>
                <p className="text-sm text-muted">
                  {doubleCommitted
                    ? t.predict.doubleLocked
                    : t.predict.doubleHint}
                </p>
              </div>
            </label>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.predict.boldScorerBet.title}</CardTitle>
          </CardHeader>

          {boldLimits && (
            <div
              className={`mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
                boldLimits.used
                  ? "border-warning/40 bg-warning/10 text-warning"
                  : "border-primary/30 bg-primary/10 text-primary"
              }`}
            >
              <span className="font-semibold">
                {t.predict.boldCounter(
                  boldLimits.used ? boldLimits.max : 0,
                  boldLimits.max
                )}
              </span>
              <span>
                {boldLimits.onThisMatch && boldLimits.playerName
                  ? t.predict.boldUsedHere(boldLimits.playerName)
                  : boldLimits.onOtherMatch
                    ? t.predict.boldExhausted
                    : t.predict.boldAvailable}
              </span>
            </div>
          )}

          {lineupLoading ? (
            <p className="py-4 text-center text-sm text-muted">
              {t.predict.lineupLoading}
            </p>
          ) : !hasPlayers ? (
            <p className="py-4 text-center text-sm text-muted">
              {t.predict.lineupUnavailable}
            </p>
          ) : boldLockedOnOther ? (
            <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
              <p>{t.predict.boldScorerBet.usedElsewhere}</p>
              {match.boldScorerRoundStatus?.otherMatchId && (
                <Link
                  href={`/matches/${match.boldScorerRoundStatus.otherMatchId}`}
                  className="mt-2 inline-block font-medium text-primary hover:underline"
                >
                  {t.predict.boldScorerBet.viewOtherMatch}
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <label
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-4 transition-all",
                  boldCheckboxDisabled
                    ? "cursor-not-allowed border-card-border/60 opacity-60"
                    : "cursor-pointer",
                  boldEnabled
                    ? "border-primary/50 bg-primary/10 shadow-[0_0_12px_rgba(34,197,94,0.12)]"
                    : "border-card-border bg-card hover:border-primary/30"
                )}
              >
                <input
                  type="checkbox"
                  checked={boldEnabled}
                  disabled={boldCheckboxDisabled}
                  onChange={(e) => handleBoldToggle(e.target.checked)}
                  className="sr-only"
                />
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-all",
                    boldEnabled
                      ? "border-primary bg-primary text-background"
                      : "border-muted/40 bg-background"
                  )}
                  aria-hidden
                >
                  {boldEnabled && (
                    <svg
                      className="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </span>
                <div>
                  <p
                    className={cn(
                      "font-medium",
                      boldEnabled ? "text-primary" : "text-foreground"
                    )}
                  >
                    {t.predict.boldScorerBet.enable}
                  </p>
                  <p className="text-sm text-muted">
                    {boldCommitted
                      ? t.predict.boldLocked
                      : t.predict.boldScorerBet.hint}
                  </p>
                </div>
              </label>

              {boldEnabled && (
                <div className="rounded-lg border border-primary/25 bg-background/80 p-4">
                  <Select
                    label={t.predict.boldScorerBet.choosePlayer}
                    value={boldPlayerId}
                    onChange={(e) => setBoldPlayerId(e.target.value)}
                    options={boldSelectOptions}
                    groups={boldPlayerGroups}
                    disabled={boldCommitted}
                  />
                  {boldPlayerId && !boldCommitted && (
                    <button
                      type="button"
                      onClick={() => setBoldPlayerId("")}
                      className="mt-3 text-sm text-muted hover:text-danger"
                    >
                      {t.predict.boldScorerBet.clearSelection}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>

        {match.isKnockout && (
          <Card>
            <CardHeader>
              <CardTitle>{t.predict.knockout}</CardTitle>
            </CardHeader>
            <Select
              label={t.predict.finishTypeLabel}
              value={finishType}
              onChange={(e) => setFinishType(e.target.value)}
              options={[
                { value: "", label: t.predict.selectFinish },
                { value: "NINETY_MINUTES", label: t.predict.ninety },
                { value: "EXTRA_TIME", label: t.predict.extraTime },
                { value: "PENALTIES", label: t.predict.penalties },
              ]}
            />

            {finishType === "PENALTIES" && (
              <div className="mt-4">
                <Select
                  label={t.predict.penaltyWinner}
                  value={penaltyWinner}
                  onChange={(e) => setPenaltyWinner(e.target.value)}
                  options={[
                    { value: "", label: t.predict.selectWinner },
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
                {t.predict.lineupLoading}
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
                    {budget.homeTotal} / {predHome} {t.predict.goalsUnit}
                    {budget.homeExceeded && (
                      <span className="mr-1 font-bold"> — {t.predict.exceeded}</span>
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
                    {budget.awayTotal} / {predAway} {t.predict.goalsUnit}
                    {budget.awayExceeded && (
                      <span className="mr-1 font-bold"> — {t.predict.exceeded}</span>
                    )}
                  </div>
                </div>
              )}

              {budget.anyExceeded && (
                <div className="mb-4 rounded-lg border border-danger/50 bg-danger/10 px-4 py-3 text-sm text-danger">
                  {t.predict.scorersExceeded}
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
                  title: t.predict.scorerPrediction,
                  hint: hasAnyGoals
                    ? t.predict.scorerHint
                    : t.predict.scorerHintNoGoals,
                  bench: t.predict.scorerBench,
                  formation: t.predict.scorerFormation,
                  officialBadge: t.predict.scorerOfficialBadge,
                  probableBadge: t.predict.scorerProbableBadge,
                  estimatedBadge: t.predict.scorerEstimatedBadge,
                  officialNote: t.predict.scorerOfficialNote,
                  probableNote: t.predict.scorerProbableNote,
                  estimatedNote: t.predict.scorerEstimatedNote,
                  selectedScorers: t.predict.selectedScorers,
                  goalsLabel: t.predict.goalsLabel,
                  remove: t.predict.removeScorer,
                }}
              />
            </>
          ) : (
            <p className="py-8 text-center text-sm text-muted">
              {t.predict.lineupUnavailable}
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
          {t.predict.submit}
        </Button>
      </form>
    </div>
  );
}
