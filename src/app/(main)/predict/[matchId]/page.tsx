"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { PredictPageSkeleton } from "@/components/predict/PredictPageSkeleton";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PitchLineup } from "@/components/predict/PitchLineup";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { PredictionCountdown } from "@/components/matches/PredictionCountdown";
import { clientFetch, isAbortError } from "@/lib/client-fetch";
import {
  invalidateMatchesListCaches,
  invalidatePredictCaches,
  clearPredictDraft,
  isPredictLineupCacheFresh,
  isPredictMatchCacheFresh,
  readPredictDraft,
  readPredictLineupCache,
  readPredictMatchCache,
  writePredictDraft,
  writePredictLineupCache,
  writePredictMatchCache,
} from "@/lib/predict-prefetch";
import {
  cn,
  formatDate,
  isPredictionAllowed,
  getPredictionLockReason,
  isWithinLineupFastRefreshWindow,
  LINEUP_FAST_REFRESH_BEFORE_MS,
  msUntilMatchKickoff,
} from "@/lib/utils";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { mergeLineupData } from "@/lib/lineup-state";
import {
  buildPlayerTeamSets,
  canAddScorer,
  getScorerBudgetStatus,
  maxGoalsForPlayer,
  MAX_SCORERS_PER_TEAM,
  MAX_SCORERS_TOTAL,
  picksToArray,
  pruneScorerPicksToBudget,
  type ScorerPicks,
} from "@/lib/scorer-prediction";
import type {
  LineupSource,
  MatchPlayerView,
} from "@/services/match-players.service";

const LINEUP_FAST_POLL_MS = 45_000;
const SCORE_OPTIONS = Array.from({ length: 10 }, (_, score) => score);

function normalizeScore(score: number) {
  if (!Number.isFinite(score)) return 0;
  return Math.min(9, Math.max(0, Math.trunc(score)));
}
 

async function fetchLineupForMatch(
  matchId: string,
  matchTime: string | Date | undefined,
  options?: { fresh?: boolean }
) {
  const needsFresh = options?.fresh === true;
  const res = await clientFetch(
    `/api/matches/${matchId}/lineup${needsFresh ? "?fresh=1" : ""}`
  );
  if (!res) return null;
  const data = await res.json();
  if (!data.success) return null;
  const payload = data.data as LineupData;
  writePredictLineupCache(matchId, payload);
  return payload;
}

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
      hasMinimumPoints: boolean;
      minimumPoints: number;
      userPoints: number;
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
  if (!m) return { ...EMPTY_FORM, scorerPicks: {} };

  const state: FormState = { ...EMPTY_FORM, scorerPicks: {} };
  if (m.userPrediction) {
    state.predHome = normalizeScore(m.userPrediction.predHome);
    state.predAway = normalizeScore(m.userPrediction.predAway);
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

function applyFormState(state: FormState, setters: {
  setPredHome: (v: number) => void;
  setPredAway: (v: number) => void;
  setIsDouble: (v: boolean) => void;
  setFinishType: (v: string) => void;
  setPenaltyWinner: (v: string) => void;
  setScorerPicks: (v: ScorerPicks) => void;
  setBoldPlayerId: (v: string) => void;
  setBoldEnabled: (v: boolean) => void;
}) {
  setters.setPredHome(normalizeScore(state.predHome));
  setters.setPredAway(normalizeScore(state.predAway));
  setters.setIsDouble(state.isDouble);
  setters.setFinishType(state.finishType);
  setters.setPenaltyWinner(state.penaltyWinner);
  setters.setScorerPicks(state.scorerPicks);
  setters.setBoldPlayerId(state.boldPlayerId);
  setters.setBoldEnabled(state.boldEnabled);
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
  applyFormState(formStateFromMatch(m), setters);
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

  const initialCachedMatch = readPredictMatchCache<MatchData>(matchId);
  const initialDraft = readPredictDraft<FormState>(matchId);
  const initialForm =
    initialDraft ?? formStateFromMatch(initialCachedMatch);
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
  const [formReady, setFormReady] = useState(
    () => initialDraft != null || initialCachedMatch != null
  );
  const draftMatchIdRef = useRef(matchId);

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

  useEffect(() => {
    setScorerPicks((prev) => {
      const pruned = pruneScorerPicksToBudget(
        prev,
        teamSets.home,
        teamSets.away,
        predHome,
        predAway
      );
      return Object.keys(pruned).length === Object.keys(prev).length &&
        Object.entries(pruned).every(([id, goals]) => prev[id] === goals)
        ? prev
        : pruned;
    });
  }, [predHome, predAway, teamSets]);

  useEffect(() => {
    if (!lineup || !boldPlayerId) return;
    if (
      !teamSets.home.has(boldPlayerId) &&
      !teamSets.away.has(boldPlayerId)
    ) {
      setBoldPlayerId("");
      if (!match?.userBoldScorerBet?.playerId) setBoldEnabled(false);
    }
  }, [lineup, teamSets, boldPlayerId, match?.userBoldScorerBet?.playerId]);

  useEffect(() => {
    const cachedMatch = readPredictMatchCache<MatchData>(matchId);
    const cachedLineup = readPredictLineupCache<LineupData>(matchId);
    const draft = readPredictDraft<FormState>(matchId);

    setMatch(cachedMatch);
    setLineup(cachedLineup);
    setLoading(!cachedMatch);
    setLineupLoading(!cachedLineup);
    setError("");
    setSuccess("");

    if (draft || cachedMatch) {
      applyFormState(draft ?? formStateFromMatch(cachedMatch), {
        setPredHome,
        setPredAway,
        setIsDouble,
        setFinishType,
        setPenaltyWinner,
        setScorerPicks,
        setBoldPlayerId,
        setBoldEnabled,
      });
      setFormReady(true);
    } else {
      setPredHome(0);
      setPredAway(0);
      setIsDouble(false);
      setFinishType("");
      setPenaltyWinner("");
      setScorerPicks({});
      setBoldPlayerId("");
      setBoldEnabled(false);
      setFormReady(false);
    }
  }, [matchId]);

  useEffect(() => {
    if (draftMatchIdRef.current !== matchId) {
      draftMatchIdRef.current = matchId;
      return;
    }
    if (!formReady) return;
    writePredictDraft<FormState>(matchId, {
      predHome,
      predAway,
      isDouble,
      finishType,
      penaltyWinner,
      scorerPicks,
      boldPlayerId,
      boldEnabled,
    });
  }, [
    matchId,
    formReady,
    predHome,
    predAway,
    isDouble,
    finishType,
    penaltyWinner,
    scorerPicks,
    boldPlayerId,
    boldEnabled,
  ]);

  useEffect(() => {
    const abort = new AbortController();
    let cancelled = false;

    async function loadLineup(silent = false) {
      if (cancelled) return;
      if (!silent && !readPredictLineupCache(matchId)) setLineupLoading(true);

      const matchTime =
        readPredictMatchCache<MatchData>(matchId)?.matchTime ?? match?.matchTime;
      const cachedLineup = readPredictLineupCache<LineupData>(matchId);
      if (
        !silent &&
        isPredictLineupCacheFresh(matchId) &&
        cachedLineup != null
      ) {
        setLineupLoading(false);
        return;
      }

      try {
        const payload = await fetchLineupForMatch(matchId, matchTime, {
          fresh: silent,
        });
        if (cancelled) return;
        if (payload) {
          setLineup((previous) => {
            const merged = mergeLineupData(previous, payload);
            writePredictLineupCache(matchId, merged);
            return merged;
          });
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

        const draft = readPredictDraft<FormState>(matchId);
        if (draft) {
          applyFormState(draft, {
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
        }
        setFormReady(true);
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
    const matchTime = match?.matchTime;
    if (!matchTime || lineup?.lineupStatus === "official") return;

    let interval: ReturnType<typeof setInterval> | undefined;
    let windowTimer: ReturnType<typeof setTimeout> | undefined;

    const startPolling = () => {
      if (interval) return;
      interval = setInterval(() => {
        void fetchLineupForMatch(matchId, matchTime, { fresh: true }).then(
          (payload) => {
            if (payload) {
              setLineup((previous) => {
                const merged = mergeLineupData(previous, payload);
                writePredictLineupCache(matchId, merged);
                return merged;
              });
            }
          }
        );
      }, LINEUP_FAST_POLL_MS);
    };

    if (isWithinLineupFastRefreshWindow(matchTime)) {
      startPolling();
    } else {
      const msUntilWindow =
        msUntilMatchKickoff(matchTime) - LINEUP_FAST_REFRESH_BEFORE_MS;
      if (msUntilWindow > 0) {
        windowTimer = setTimeout(() => {
          void fetchLineupForMatch(matchId, matchTime, { fresh: true }).then(
            (payload) => {
              if (payload) {
                setLineup((previous) => {
                  const merged = mergeLineupData(previous, payload);
                  writePredictLineupCache(matchId, merged);
                  return merged;
                });
              }
            }
          );
          startPolling();
        }, msUntilWindow);
      }
    }

    return () => {
      if (interval) clearInterval(interval);
      if (windowTimer) clearTimeout(windowTimer);
    };
  }, [matchId, match?.matchTime, lineup?.lineupStatus]);

  function toggleScorer(playerId: string) {
    setScorerPicks((prev) => {
      if (playerId in prev) {
        const next = { ...prev };
        delete next[playerId];
        return next;
      }
      if (
        !canAddScorer(
          prev,
          playerId,
          teamSets.home,
          teamSets.away,
          predHome,
          predAway
        )
      ) {
        return prev;
      }
      return { ...prev, [playerId]: 1 };
    });
  }

  function setScorerGoals(playerId: string, goals: number) {
    setScorerPicks((prev) => {
      if (!(playerId in prev)) return prev;
      const cap = maxGoalsForPlayer(
        prev,
        playerId,
        teamSets.home,
        teamSets.away,
        predHome,
        predAway
      );
      return { ...prev, [playerId]: Math.max(1, Math.min(cap, goals)) };
    });
  }

  function canSelectScorer(playerId: string) {
    if (playerId in scorerPicks) return true;
    return canAddScorer(
      scorerPicks,
      playerId,
      teamSets.home,
      teamSets.away,
      predHome,
      predAway
    );
  }

  function getMaxGoalsForPlayer(playerId: string) {
    return maxGoalsForPlayer(
      scorerPicks,
      playerId,
      teamSets.home,
      teamSets.away,
      predHome,
      predAway
    );
  }

  function handleDoubleToggle(checked: boolean) {
    const limits = match?.roundUsageLimits?.doubles;
    if (checked && limits && !limits.canEnable && !limits.onThisMatch) {
      setError(t.predict.doubleExhausted);
      return;
    }
    setError("");
    setIsDouble(checked);
  }

  function handleBoldToggle(checked: boolean) {
    const limits = match?.roundUsageLimits?.boldScorer;
    if (
      checked &&
      limits &&
      !limits.hasMinimumPoints &&
      !limits.onThisMatch
    ) {
      setError(
        locale === "ar"
          ? `تحتاج ${limits.minimumPoints} نقاط على الأقل لاستخدام الرهان`
          : `You need at least ${limits.minimumPoints} points to use the scorer bet`
      );
      return;
    }
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

    if (hasAnyGoals && !budget.isComplete) {
      setError(
        hasPlayers
          ? t.predict.scorersIncomplete
          : t.predict.scorersNeedLineup
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
      const res = await clientFetch("/api/predictions", {
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

      const data = res ? await res.json() : null;
      if (!data.success) {
        setError(data.error);
        return;
      }

      invalidatePredictCaches(matchId);
      clearPredictDraft(matchId);
      invalidateMatchesListCaches();
      setSuccess(t.matches.predictionSubmitted);
      setTimeout(() => router.push(`/matches/${matchId}`), 250);
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
  const boldLockedOnOther =
    boldLimits?.onOtherMatch ??
    match.boldScorerRoundStatus?.onOtherMatch ??
    false;
  const matchLockReason = getPredictionLockReason(match.matchTime, match.status);
  const boldCheckboxDisabled =
    Boolean(matchLockReason) ||
    (boldLimits != null && !boldLimits.canUse && !boldLimits.onThisMatch);
  const doubleCheckboxDisabled =
    doubleLimits != null &&
    !doubleLimits.canEnable &&
    !doubleLimits.onThisMatch;
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
            <span className="font-medium">{match.homeTeam.name}</span>
          </div>
          <span className="text-muted">{t.matches.vs}</span>
          <div className="flex items-center gap-2">
            <span className="font-medium">{match.awayTeam.name}</span>
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
          <div className="flex items-center justify-center gap-3" dir="ltr">
            <div className="flex items-center gap-2">
              <TeamLogo {...match.homeTeam} />
            </div>

            <label htmlFor={`pred-home-${match.id}`} className="sr-only">{`${match.homeTeam.shortName} score`}</label>
            <select
              id={`pred-home-${match.id}`}
              aria-label={`${match.homeTeam.shortName} score`}
              value={String(predHome)}
              onChange={(e) => setPredHome(Number(e.target.value))}
              className="min-w-0 rounded-lg border py-2 px-3 text-base font-bold tabular-nums transition-colors border-card-border bg-card text-foreground"
            >
              {SCORE_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            <span className="text-center text-2xl font-bold text-muted">-</span>

            <label htmlFor={`pred-away-${match.id}`} className="sr-only">{`${match.awayTeam.shortName} score`}</label>
            <select
              id={`pred-away-${match.id}`}
              aria-label={`${match.awayTeam.shortName} score`}
              value={String(predAway)}
              onChange={(e) => setPredAway(Number(e.target.value))}
              className="min-w-0 rounded-lg border py-2 px-3 text-base font-bold tabular-nums transition-colors border-card-border bg-card text-foreground"
            >
              {SCORE_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            <div className="flex items-center gap-2">
              <TeamLogo {...match.awayTeam} />
            </div>
          </div>
          <p className="mt-3 text-center text-sm text-muted">
            {t.predict.scoreFirstHint}
          </p>
        </Card>

        <Card className="relative overflow-hidden border-orange-400/45 bg-gradient-to-br from-orange-950/50 via-card to-amber-500/10 shadow-xl shadow-orange-950/25">
          <div className="pointer-events-none absolute -left-16 -top-20 h-44 w-44 rounded-full bg-orange-500/15 blur-3xl" />
          <CardHeader className="relative">
            <CardTitle className="flex items-center gap-3 text-orange-100">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-orange-300/40 bg-orange-500/20 text-lg font-black text-orange-200 shadow-inner">
                x2
              </span>
              {t.predict.doublePoints}
            </CardTitle>
          </CardHeader>

          <div className="relative space-y-3">
            {doubleLimits && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-orange-400/30 bg-orange-500/10 px-3 py-2 text-sm">
                <span className="font-semibold text-orange-200">
                  {t.predict.doubleCounter(
                    doubleLimits.used,
                    doubleLimits.max
                  )}
                </span>
                {doubleLimits.onThisMatch ? (
                  <span className="text-orange-200">
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
                  : "cursor-pointer border-orange-400/30 bg-black/10 hover:border-orange-300/60"
              } ${isDouble ? "border-orange-400/50 bg-orange-500/15" : ""}`}
            >
              <input
                type="checkbox"
                checked={isDouble}
                disabled={doubleCheckboxDisabled}
                onChange={(e) => handleDoubleToggle(e.target.checked)}
                className="h-5 w-5 rounded accent-orange-500 disabled:cursor-not-allowed"
              />
              <div>
                <p className="font-medium text-orange-100">
                  {t.predict.doublePoints}
                </p>
                <p className="text-sm text-muted">
                  {isDouble
                    ? t.predict.doubleEnabled
                    : t.predict.doubleHint}
                </p>
              </div>
            </label>
          </div>
        </Card>

        <Card className="border-red-400/40 bg-gradient-to-br from-red-950/40 via-card to-rose-500/5 shadow-xl shadow-red-950/25">
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
                  : !boldLimits.hasMinimumPoints
                    ? locale === "ar"
                      ? `يتطلب ${boldLimits.minimumPoints} نقاط (نقاطك ${boldLimits.userPoints})`
                      : `Requires ${boldLimits.minimumPoints} points (${boldLimits.userPoints} now)`
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
                    {boldEnabled
                      ? t.predict.boldScorerBet.selectingPlayer
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
                    disabled={Boolean(matchLockReason)}
                  />
                  {boldPlayerId && !matchLockReason && (
                    <button
                      type="button"
                      onClick={() => {
                        setBoldPlayerId("");
                        setBoldEnabled(false);
                      }}
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
                <div className="mb-4 rounded-lg border border-card-border bg-card px-3 py-2 text-sm text-muted">
                  <span className="font-medium text-foreground">
                    {t.predict.scorerLimitCounter(
                      budget.totalCount,
                      MAX_SCORERS_TOTAL
                    )}
                  </span>
                  <span className="mr-1">
                    {" "}
                    — {t.predict.scorerLimitHint(
                      MAX_SCORERS_PER_TEAM,
                      MAX_SCORERS_TOTAL
                    )}
                  </span>
                </div>
              )}

              {hasAnyGoals && (
                <div className="mb-4 grid gap-2 sm:grid-cols-2">
                  <div
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      budget.homeExceeded
                        ? "border-danger/50 bg-danger/10 text-danger"
                        : budget.homeIncomplete
                          ? "border-warning/50 bg-warning/10 text-warning"
                          : budget.homeComplete && predHome > 0
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-card-border bg-card text-muted"
                    }`}
                  >
                    <span className="font-medium text-foreground">
                      {match.homeTeam.name}:{" "}
                    </span>
                    {budget.homeTotal} / {budget.homeTarget}{" "}
                    {t.predict.goalsUnit}
                    {budget.homeExceeded && (
                      <span className="mr-1 font-bold"> — {t.predict.exceeded}</span>
                    )}
                    {!budget.homeExceeded && budget.homeIncomplete && predHome > 0 && (
                      <span className="mr-1 font-bold">
                        {" "}
                        —{" "}
                        {t.predict.scorersRemaining(
                          budget.homeTarget - budget.homeTotal
                        )}
                      </span>
                    )}
                    {!budget.homeExceeded && budget.homeComplete && predHome > 0 && (
                      <span className="mr-1 font-bold"> — {t.predict.scorersComplete}</span>
                    )}
                  </div>
                  <div
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      budget.awayExceeded
                        ? "border-danger/50 bg-danger/10 text-danger"
                        : budget.awayIncomplete
                          ? "border-warning/50 bg-warning/10 text-warning"
                          : budget.awayComplete && predAway > 0
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-card-border bg-card text-muted"
                    }`}
                  >
                    <span className="font-medium text-foreground">
                      {match.awayTeam.name}:{" "}
                    </span>
                    {budget.awayTotal} / {budget.awayTarget}{" "}
                    {t.predict.goalsUnit}
                    {budget.awayExceeded && (
                      <span className="mr-1 font-bold"> — {t.predict.exceeded}</span>
                    )}
                    {!budget.awayExceeded && budget.awayIncomplete && predAway > 0 && (
                      <span className="mr-1 font-bold">
                        {" "}
                        —{" "}
                        {t.predict.scorersRemaining(
                          budget.awayTarget - budget.awayTotal
                        )}
                      </span>
                    )}
                    {!budget.awayExceeded && budget.awayComplete && predAway > 0 && (
                      <span className="mr-1 font-bold"> — {t.predict.scorersComplete}</span>
                    )}
                  </div>
                </div>
              )}

              {budget.anyExceeded && (
                <div className="mb-4 rounded-lg border border-danger/50 bg-danger/10 px-4 py-3 text-sm text-danger">
                  {t.predict.scorersExceeded}
                </div>
              )}

              {budget.anyIncomplete && !budget.anyExceeded && (
                <div className="mb-4 rounded-lg border border-warning/50 bg-warning/10 px-4 py-3 text-sm text-warning">
                  {t.predict.scorersIncomplete}
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
                canSelectPlayer={canSelectScorer}
                maxGoalsForPlayer={getMaxGoalsForPlayer}
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
          disabled={
            budget.anyExceeded ||
            needsLineupForScorers ||
            (hasAnyGoals && !budget.isComplete)
          }
        >
          {t.predict.submit}
        </Button>
      </form>
    </div>
  );
}
