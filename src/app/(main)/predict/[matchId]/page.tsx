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
import { invalidateLeaguePredictionsCache } from "@/lib/league-predictions-prefetch";
import { invalidateMatchDetailCache } from "@/lib/match-detail-cache";
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
import { FEATURE_FLAGS } from '@/lib/feature-flags';
import { mergeLineupData } from "@/lib/lineup-state";
import { isGoalkeeperPosition } from "@/lib/goalkeeper";
import {
  buildPlayerTeamSets,
  canAddScorer,
  getScorerBudgetStatus,
  maxGoalsForPlayer,
  MAX_SCORERS_PER_TEAM,
  MAX_SCORERS_TOTAL,
  picksToArray,
  pruneScorerPicksToBudget,
  scorerGoalTarget,
  type ScorerPicks,
} from "@/lib/scorer-prediction";
import type {
  LineupSource,
  MatchPlayerView,
} from "@/services/match-players.service";
import { PredictionFeatureTag } from '@/components/ui/PredictionFeatureTag';

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
  userOctopusBet?: {
    playerId: string;
    points: number;
    player: { name: string };
  } | null;
  octopusCount?: number;
  boldScorerRoundStatus?: {
    used: boolean;
    onThisMatch: boolean;
    onOtherMatch: boolean;
    otherMatchId: string | null;
  } | null;
  octopusRoundStatus?: {
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
      playerId?: string | null;
      points?: number;
    };
    octopus: {
      used: boolean;
      max: number;
      onThisMatch: boolean;
      onOtherMatch: boolean;
      canUse: boolean;
      otherMatchId: string | null;
      playerName: string | null;
      playerId?: string | null;
      points?: number;
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
  octopusPlayerId: string;
  octopusEnabled: boolean;
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
  octopusPlayerId: "",
  octopusEnabled: false,
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
  if (m.userOctopusBet?.playerId) {
    state.octopusPlayerId = m.userOctopusBet.playerId;
    state.octopusEnabled = true;
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
  setOctopusPlayerId: (v: string) => void;
  setOctopusEnabled: (v: boolean) => void;
}) {
  setters.setPredHome(normalizeScore(state.predHome));
  setters.setPredAway(normalizeScore(state.predAway));
  setters.setIsDouble(state.isDouble);
  setters.setFinishType(state.finishType);
  setters.setPenaltyWinner(state.penaltyWinner);
  setters.setScorerPicks(state.scorerPicks);
  setters.setBoldPlayerId(state.boldPlayerId);
  setters.setBoldEnabled(state.boldEnabled);
  setters.setOctopusPlayerId(state.octopusPlayerId ?? "");
  setters.setOctopusEnabled(Boolean(state.octopusEnabled));
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
  setOctopusPlayerId: (v: string) => void;
  setOctopusEnabled: (v: boolean) => void;
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
  const [octopusEnabled, setOctopusEnabled] = useState(
    Boolean(initialForm.octopusEnabled)
  );
  const [octopusPlayerId, setOctopusPlayerId] = useState(
    initialForm.octopusPlayerId ?? ""
  );
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
  const octopusCopy = useMemo(
    () =>
      locale === "ar"
        ? {
            title: "الأخطبوط",
            enable: "فعّل الأخطبوط",
            hint: "مرة واحدة كل جولة. اختر حارساً؛ نقاطه من التصديات الرسمية فقط.",
            counter: (used: boolean, max: number) =>
              `الأخطبوط: ${used ? 1 : 0}/${max}`,
            available: "متاحة — اختر حارساً واحداً",
            usedHere: (name: string) => `مستخدمة هالمباراة: ${name}`,
            usedElsewhere: "استخدمت الأخطبوط في مباراة ثانية هالجولة",
            choose: "اختر الحارس",
            chooseRequired: "اختر حارساً للأخطبوط",
            selecting: "جاري اختيار الحارس للأخطبوط",
            clear: "إزالة الحارس",
            change: "تقدر تغيّر الحارس من القائمة.",
            conflict: "ما تقدر تستخدم الأخطبوط مع المضاعفة أو الرهان على نفس المباراة",
            noKeepers: "ما فيه حراس متاحين في التشكيلة حالياً",
            source: "الحساب من API-Football الرسمي فقط: 3 تصديات = +1، 5 = +3، 7 = +5، 10 = +8. إذا منتخب الحارس استقبل هدفًا تروح فرصة سقف 10 تصديات، هدفين تروح فرصة 7، و3 أهداف فأكثر تروح فرصة 5. البلنتي أثناء المباراة يحسب إذا تصدى له الحارس، لكن ركلات الترجيح بعد النهاية لا تدخل.",
            viewOtherMatch: "شوف المباراة",
          }
        : {
            title: "Octopus",
            enable: "Enable Octopus",
            hint: "Once per round. Pick a goalkeeper; points use official saves only.",
            counter: (used: boolean, max: number) =>
              `Octopus: ${used ? 1 : 0}/${max}`,
            available: "Available — pick one goalkeeper",
            usedHere: (name: string) => `Used this match: ${name}`,
            usedElsewhere: "You used Octopus on another match this round",
            choose: "Choose goalkeeper",
            chooseRequired: "Pick a goalkeeper for Octopus",
            selecting: "Selecting goalkeeper for Octopus",
            clear: "Remove goalkeeper",
            change: "You can change the goalkeeper from the list.",
            conflict: "Can't use Octopus with double or the bet on the same match",
            noKeepers: "No goalkeepers are available in the lineup yet",
            source: "Scoring uses official API-Football saves only: 3 saves = +1, 5 = +3, 7 = +5, 10 = +8, plus +3 for a clean sheet. If the goalkeeper's team concedes 1 goal, the 10-save tier is gone; 2 removes the 7-save tier; 3+ removes the 5-save tier. In-match penalty saves count; post-match shootout saves do not.",
            viewOtherMatch: "View match",
          },
    [locale]
  );

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
    if (!lineup || !octopusPlayerId) return;
    const keeperStillAvailable = [
      ...lineup.homePlayers,
      ...lineup.awayPlayers,
    ].some(
      (player) =>
        player.id === octopusPlayerId && isGoalkeeperPosition(player.position)
    );
    if (
      !keeperStillAvailable &&
      octopusPlayerId !== match?.userOctopusBet?.playerId
    ) {
      setOctopusPlayerId("");
      if (!match?.userOctopusBet?.playerId) setOctopusEnabled(false);
    }
  }, [lineup, octopusPlayerId, match?.userOctopusBet?.playerId]);

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
        setOctopusPlayerId,
        setOctopusEnabled,
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
      setOctopusPlayerId("");
      setOctopusEnabled(false);
      setFormReady(false);
    }
  }, [matchId, match?.matchTime, lineup?.lineupStatus, t.errors.loadFailed]);

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
      octopusPlayerId,
      octopusEnabled,
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
    octopusPlayerId,
    octopusEnabled,
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
            setOctopusPlayerId,
            setOctopusEnabled,
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
            setOctopusPlayerId,
            setOctopusEnabled,
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
    if (playerId in scorerPicks) {
      setScorerPicks((prev) => {
        const next = { ...prev };
        delete next[playerId];
        return next;
      });
      if (playerId === boldPlayerId) {
        setBoldPlayerId("");
        setBoldEnabled(false);
      }
      return;
    }

    if (
      !canAddScorer(
        scorerPicks,
        playerId,
        teamSets.home,
        teamSets.away,
        predHome,
        predAway
      )
    ) {
      return;
    }

    setScorerPicks((prev) => ({ ...prev, [playerId]: 1 }));
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
    // Allow unchecking anytime, but prevent enabling if another feature is active.
    if (checked && (boldEnabled || octopusEnabled)) {
      setError(
        octopusEnabled ? octopusCopy.conflict : t.predict.doubleAndBoldConflict
      );
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
    // Allow unchecking anytime, but prevent enabling if another feature is active.
    if (checked && isDouble) {
      setError(t.predict.doubleAndBoldConflict);
      return;
    }
    if (checked && octopusEnabled) {
      setError(octopusCopy.conflict);
      return;
    }
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

  function handleBoldPlayerChange(playerId: string) {
    if (octopusEnabled) {
      setError(octopusCopy.conflict);
      return;
    }

    if (!playerId) {
      setBoldPlayerId("");
      return;
    }

    const isHome = teamSets.home.has(playerId);
    const isAway = teamSets.away.has(playerId);
    if (!isHome && !isAway) return;

    const target = scorerGoalTarget(isHome ? predHome : predAway);
    if (target <= 0) {
      if (predHome === 0 && predAway === 0) {
        if (isHome) {
          setPredHome(1);
        } else {
          setPredAway(1);
        }
        setScorerPicks({ [playerId]: 1 });
        setBoldPlayerId(playerId);
        setBoldEnabled(true);
        setError("");
        return;
      }

      setError(t.predict.scorersExceeded);
      return;
    }

    setError("");
    setBoldEnabled(true);

    if (!(playerId in scorerPicks)) {
      const teamPlayerIds = isHome ? teamSets.home : teamSets.away;
      const teamPickIds = Object.keys(scorerPicks).filter((id) =>
        teamPlayerIds.has(id)
      );
      const replaceId =
        boldPlayerId && teamPlayerIds.has(boldPlayerId)
          ? boldPlayerId
          : teamPickIds[teamPickIds.length - 1];

      if (Object.keys(scorerPicks).length > 0) {
        setError(t.predict.scorersIncomplete);
        return;
      }

      if (
        canAddScorer(
          scorerPicks,
          playerId,
          teamSets.home,
          teamSets.away,
          predHome,
          predAway
        )
      ) {
        setScorerPicks((prev) => ({ ...prev, [playerId]: 1 }));
      } else if (replaceId) {
        setScorerPicks((prev) => {
          const next = { ...prev };
          const goals = next[replaceId] ?? 1;
          delete next[replaceId];
          next[playerId] = goals;
          return pruneScorerPicksToBudget(
            next,
            teamSets.home,
            teamSets.away,
            predHome,
            predAway
          );
        });
      } else {
        setError(t.predict.scorersIncomplete);
        return;
      }
    }

    setBoldPlayerId(playerId);
  }

  function handleOctopusToggle(checked: boolean) {
    if (checked && (isDouble || boldEnabled)) {
      setError(octopusCopy.conflict);
      return;
    }
    const limits = match?.roundUsageLimits?.octopus;
    if (checked && limits && !limits.canUse && !limits.onThisMatch) {
      setError(octopusCopy.usedElsewhere);
      return;
    }
    setError("");
    setOctopusEnabled(checked);
    if (!checked) setOctopusPlayerId("");
  }

  function handleOctopusPlayerChange(playerId: string) {
    if (!playerId) {
      setOctopusPlayerId("");
      return;
    }
    if (isDouble || boldEnabled) {
      setError(octopusCopy.conflict);
      return;
    }

    const player = [
      ...(lineup?.homePlayers ?? []),
      ...(lineup?.awayPlayers ?? []),
    ].find((candidate) => candidate.id === playerId);
    if (!player || !isGoalkeeperPosition(player.position)) return;

    setError("");
    setOctopusEnabled(true);
    setOctopusPlayerId(playerId);
  }

  async function handleClearOctopusBet() {
    setError("");
    setSuccess("");

    const savedOnThisMatch =
      match?.roundUsageLimits?.octopus?.onThisMatch ||
      match?.octopusRoundStatus?.onThisMatch ||
      Boolean(match?.userOctopusBet?.playerId);

    if (!savedOnThisMatch) {
      setOctopusPlayerId("");
      setOctopusEnabled(false);
      return;
    }

    setSubmitting(true);
    try {
      const res = await clientFetch("/api/octopus-bet", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, playerId: null }),
      });
      if (!res) throw new Error(t.errors.loadFailed);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setOctopusPlayerId("");
      setOctopusEnabled(false);
      setMatch((previous) => {
        if (!previous) return previous;
        const octopus = previous.roundUsageLimits?.octopus;
        const roundUsageLimits =
          previous.roundUsageLimits && octopus
            ? {
                ...previous.roundUsageLimits,
                octopus: {
                  ...octopus,
                  used: false,
                  onThisMatch: false,
                  onOtherMatch: false,
                  canUse: true,
                  otherMatchId: null,
                  playerName: null,
                  playerId: null,
                  points: 0,
                },
              }
            : previous.roundUsageLimits;
        return {
          ...previous,
          userOctopusBet: null,
          octopusRoundStatus: previous.octopusRoundStatus
            ? {
                ...previous.octopusRoundStatus,
                used: false,
                onThisMatch: false,
                onOtherMatch: false,
                otherMatchId: null,
              }
            : previous.octopusRoundStatus,
          roundUsageLimits,
        };
      });
      invalidatePredictCaches(matchId);
      invalidateMatchDetailCache(matchId);
      invalidateLeaguePredictionsCache(matchId);
      invalidateMatchesListCaches();
      setSuccess(t.matches.predictionSubmitted);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.loadFailed);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClearBoldBet() {
    setError("");
    setSuccess("");

    const savedOnThisMatch =
      match?.roundUsageLimits?.boldScorer?.onThisMatch ||
      match?.boldScorerRoundStatus?.onThisMatch ||
      Boolean(match?.userBoldScorerBet?.playerId);

    if (!savedOnThisMatch) {
      setBoldPlayerId("");
      setBoldEnabled(false);
      return;
    }

    setSubmitting(true);
    try {
      const res = await clientFetch("/api/bold-scorer-bet", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, playerId: null }),
      });
      if (!res) throw new Error(t.errors.loadFailed);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setBoldPlayerId("");
      setBoldEnabled(false);
      setMatch((previous) => {
        if (!previous) return previous;
        const bold = previous.roundUsageLimits?.boldScorer;
        const roundUsageLimits =
          previous.roundUsageLimits && bold
            ? {
                ...previous.roundUsageLimits,
                boldScorer: {
                  ...bold,
                  used: false,
                  onThisMatch: false,
                  onOtherMatch: false,
                  canUse: bold.hasMinimumPoints,
                  otherMatchId: null,
                  playerName: null,
                  playerId: null,
                  points: 0,
                },
              }
            : previous.roundUsageLimits;
        return {
          ...previous,
          userBoldScorerBet: null,
          boldScorerRoundStatus: previous.boldScorerRoundStatus
            ? {
                ...previous.boldScorerRoundStatus,
                used: false,
                onThisMatch: false,
                onOtherMatch: false,
                otherMatchId: null,
              }
            : previous.boldScorerRoundStatus,
          roundUsageLimits,
        };
      });
      invalidatePredictCaches(matchId);
      invalidateMatchDetailCache(matchId);
      invalidateLeaguePredictionsCache(matchId);
      invalidateMatchesListCaches();
      setSuccess(t.matches.predictionSubmitted);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.loadFailed);
    } finally {
      setSubmitting(false);
    }
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

    if (octopusEnabled && !octopusPlayerId) {
      setError(octopusCopy.chooseRequired);
      return;
    }

    if (isDouble && (boldEnabled || octopusEnabled)) {
      setError(
        octopusEnabled ? octopusCopy.conflict : t.predict.doubleAndBoldConflict
      );
      return;
    }

    if (boldEnabled && octopusEnabled) {
      setError(octopusCopy.conflict);
      return;
    }

    const octopusLimits = match?.roundUsageLimits?.octopus;
    if (
      octopusEnabled &&
      octopusLimits &&
      !octopusLimits.canUse &&
      !octopusLimits.onThisMatch
    ) {
      setError(octopusCopy.usedElsewhere);
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
          octopusPlayerId: octopusEnabled ? octopusPlayerId || null : null,
        }),
      });

      const data = res ? await res.json() : null;
      if (!data.success) {
        setError(data.error);
        return;
      }

      invalidatePredictCaches(matchId);
      invalidateMatchDetailCache(matchId);
      invalidateLeaguePredictionsCache(matchId);
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
  const octopusLimits = match.roundUsageLimits?.octopus;
  const boldOnThisMatch =
    Boolean(boldLimits?.onThisMatch) ||
    Boolean(match.boldScorerRoundStatus?.onThisMatch) ||
    Boolean(match.userBoldScorerBet?.playerId);
  const boldLockedOnOther =
    boldLimits?.onOtherMatch ??
    match.boldScorerRoundStatus?.onOtherMatch ??
    false;
  const octopusOnThisMatch =
    Boolean(octopusLimits?.onThisMatch) ||
    Boolean(match.octopusRoundStatus?.onThisMatch) ||
    Boolean(match.userOctopusBet?.playerId);
  const octopusLockedOnOther =
    octopusLimits?.onOtherMatch ??
    match.octopusRoundStatus?.onOtherMatch ??
    false;
  const matchLockReason = getPredictionLockReason(match.matchTime, match.status);
  const boldCheckboxLockedBySelection = boldEnabled && Boolean(boldPlayerId);
  const octopusCheckboxLockedBySelection =
    octopusEnabled && Boolean(octopusPlayerId);
  // Once a bold player is selected, changing/removing happens from the player controls.
  const boldCheckboxDisabled =
    loading || !match.roundUsageLimits ||
    Boolean(matchLockReason) ||
    boldCheckboxLockedBySelection ||
    (boldLimits != null && !boldLimits.canUse && !boldLimits.onThisMatch) ||
    (isDouble && !boldEnabled) ||
    (octopusEnabled && !boldEnabled);
  const octopusCheckboxDisabled =
    loading || !match.roundUsageLimits ||
    Boolean(matchLockReason) ||
    octopusCheckboxLockedBySelection ||
    (octopusLimits != null &&
      !octopusLimits.canUse &&
      !octopusLimits.onThisMatch) ||
    ((isDouble || boldEnabled) && !octopusEnabled);
  const doubleCheckboxDisabled =
    loading || !match.roundUsageLimits ||
    (doubleLimits != null &&
      !doubleLimits.canEnable &&
      !doubleLimits.onThisMatch) ||
    ((boldEnabled || octopusEnabled) && !isDouble); // disable enabling only, allow unchecking
  const predictedScorerIds = new Set(Object.keys(scorerPicks));
  const hasPredictedScorers = predictedScorerIds.size > 0;
  const toBoldPlayerOption = (player: MatchPlayerView) => ({
    value: player.id,
    label:
      player.section === "bench"
        ? `${player.name} (${t.predict.scorerBench})`
        : player.name,
  });
  const boldPlayerGroups =
    lineup && hasPlayers
      ? [
          {
            label: match.homeTeam.name,
            options: lineup.homePlayers
              .filter(
                (player) =>
                  !hasPredictedScorers || predictedScorerIds.has(player.id)
              )
              .map(toBoldPlayerOption),
          },
          {
            label: match.awayTeam.name,
            options: lineup.awayPlayers
              .filter(
                (player) =>
                  !hasPredictedScorers || predictedScorerIds.has(player.id)
              )
              .map(toBoldPlayerOption),
          },
        ].filter((group) => group.options.length > 0)
      : undefined;

  const boldSelectOptions = [
    { value: "", label: t.predict.boldScorerBet.choosePlayer },
  ];
  const toGoalkeeperOption = (player: MatchPlayerView) => ({
    value: player.id,
    label:
      player.section === "bench"
        ? `${player.name} (${t.predict.scorerBench})`
        : player.name,
  });
  const octopusGoalkeeperGroups =
    lineup && hasPlayers
      ? [
          {
            label: match.homeTeam.name,
            options: lineup.homePlayers
              .filter((player) => isGoalkeeperPosition(player.position))
              .map(toGoalkeeperOption),
          },
          {
            label: match.awayTeam.name,
            options: lineup.awayPlayers
              .filter((player) => isGoalkeeperPosition(player.position))
              .map(toGoalkeeperOption),
          },
        ].filter((group) => group.options.length > 0)
      : undefined;
  const hasOctopusGoalkeeperOptions =
    (octopusGoalkeeperGroups?.some((group) => group.options.length > 0) ??
      false);
  const octopusSelectOptions = [
    { value: "", label: octopusCopy.choose },
  ];
  const matchVisualDir = locale === "ar" ? "rtl" : "ltr";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href={`/matches/${matchId}`} className="text-sm text-primary hover:underline">
        {t.matches.back}
      </Link>

      <Card className="border-primary/25 bg-gradient-to-b from-primary/10 via-card/95 to-card">
        <div
          className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3"
          dir={matchVisualDir}
        >
          <div className="flex min-w-0 items-center gap-2">
            <TeamLogo {...match.homeTeam} />
            <span className="truncate font-medium">{match.homeTeam.name}</span>
          </div>
          <span className="text-muted">{t.matches.vs}</span>
          <div className="flex min-w-0 items-center justify-end gap-2">
            <span className="truncate font-medium">{match.awayTeam.name}</span>
            <TeamLogo {...match.awayTeam} />
          </div>
        </div>
        <p className="mt-2 text-center text-sm text-muted">
          {formatDate(match.matchTime, locale)}
        </p>
        {typeof match.octopusCount === 'number' && (
          <div className="mt-2 flex justify-center">
            <PredictionFeatureTag
              type="octopus"
              label={`${octopusCopy.title}: ${match.octopusCount}`}
              title={locale === 'ar' ? 'عدد مستخدمي الأخطبوط' : 'Octopus picks count'}
            />
          </div>
        )}
        <div className="mt-4">
          <PredictionCountdown
            matchTime={match.matchTime}
            variant="prominent"
          />
        </div>
      </Card>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && <ErrorMessage message={error} />}
        {FEATURE_FLAGS.showNotifications && success && (
          <div className="rounded-lg border border-primary/50 bg-primary/10 px-4 py-3 text-sm text-primary">
            {success}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{t.predict.scorePrediction}</CardTitle>
          </CardHeader>
          <div
            className="grid grid-cols-[minmax(0,auto)_auto_auto_auto_minmax(0,auto)] items-center justify-center gap-3"
            dir={matchVisualDir}
          >
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
                    : boldEnabled
                    ? t.predict.doubleAndBoldConflict
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

          {boldOnThisMatch && (
            <div className="mb-4 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  {boldLimits?.playerName || match.userBoldScorerBet?.player.name
                    ? t.predict.boldUsedHere(
                        boldLimits?.playerName ??
                          match.userBoldScorerBet?.player.name ??
                          ""
                      )
                    : t.predict.boldScorerBet.selectingPlayer}
                </span>
                <button
                  type="button"
                  onClick={handleClearBoldBet}
                  disabled={submitting || Boolean(matchLockReason)}
                  className="rounded-lg border border-primary/40 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t.predict.boldScorerBet.clearSelection}
                </button>
              </div>
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
                    {isDouble
                      ? t.predict.doubleAndBoldConflict
                      : boldEnabled
                      ? t.predict.boldScorerBet.selectingPlayer
                      : t.predict.boldScorerBet.hint}
                  </p>
                </div>
              </label>

              {boldEnabled && (
                <div className="rounded-lg border border-primary/25 bg-background/80 p-4">
                  {boldPlayerId && !matchLockReason && (
                    <p className="mb-2 text-sm text-muted">
                      {locale === "ar"
                        ? "تقدر تغيّر لاعب الرهان من القائمة."
                        : "You can change the bold player from the list."}
                    </p>
                  )}
                  <Select
                    label={t.predict.boldScorerBet.choosePlayer}
                    value={boldPlayerId}
                    onChange={(e) => handleBoldPlayerChange(e.target.value)}
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

        <Card className="border-cyan-300/40 bg-gradient-to-br from-cyan-950/45 via-card to-teal-500/10 shadow-xl shadow-cyan-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-cyan-100">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-200/40 bg-cyan-400/15 text-sm font-black text-cyan-100">
                GK
              </span>
              {octopusCopy.title}
            </CardTitle>
          </CardHeader>

          {octopusLimits && (
            <div
              className={cn(
                "mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm",
                octopusLimits.used
                  ? "border-cyan-300/45 bg-cyan-400/10 text-cyan-100"
                  : "border-primary/30 bg-primary/10 text-primary"
              )}
            >
              <span className="font-semibold">
                {octopusCopy.counter(octopusLimits.used, octopusLimits.max)}
              </span>
              <span>
                {octopusLimits.onThisMatch && octopusLimits.playerName
                  ? octopusCopy.usedHere(octopusLimits.playerName)
                  : octopusLimits.onOtherMatch
                    ? octopusCopy.usedElsewhere
                    : octopusCopy.available}
              </span>
            </div>
          )}

          {octopusOnThisMatch && (
            <div className="mb-4 rounded-lg border border-cyan-300/35 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  {octopusLimits?.playerName || match.userOctopusBet?.player.name
                    ? octopusCopy.usedHere(
                        octopusLimits?.playerName ??
                          match.userOctopusBet?.player.name ??
                          ""
                      )
                    : octopusCopy.selecting}
                </span>
                <button
                  type="button"
                  onClick={handleClearOctopusBet}
                  disabled={submitting || Boolean(matchLockReason)}
                  className="rounded-lg border border-cyan-200/40 px-3 py-1.5 text-xs font-medium text-cyan-100 hover:bg-cyan-300/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {octopusCopy.clear}
                </button>
              </div>
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
          ) : octopusLockedOnOther ? (
            <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
              <p>{octopusCopy.usedElsewhere}</p>
              {(octopusLimits?.otherMatchId ||
                match.octopusRoundStatus?.otherMatchId) && (
                <Link
                  href={`/matches/${
                    octopusLimits?.otherMatchId ??
                    match.octopusRoundStatus?.otherMatchId
                  }`}
                  className="mt-2 inline-block font-medium text-primary hover:underline"
                >
                  {octopusCopy.viewOtherMatch}
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <label
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-4 transition-all",
                  octopusCheckboxDisabled
                    ? "cursor-not-allowed border-card-border/60 opacity-60"
                    : "cursor-pointer",
                  octopusEnabled
                    ? "border-cyan-300/60 bg-cyan-400/10 shadow-[0_0_12px_rgba(34,211,238,0.14)]"
                    : "border-card-border bg-card hover:border-cyan-300/40"
                )}
              >
                <input
                  type="checkbox"
                  checked={octopusEnabled}
                  disabled={octopusCheckboxDisabled}
                  onChange={(e) => handleOctopusToggle(e.target.checked)}
                  className="sr-only"
                />
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-all",
                    octopusEnabled
                      ? "border-cyan-200 bg-cyan-300 text-cyan-950"
                      : "border-muted/40 bg-background"
                  )}
                  aria-hidden
                >
                  {octopusEnabled && (
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
                      octopusEnabled ? "text-cyan-100" : "text-foreground"
                    )}
                  >
                    {octopusCopy.enable}
                  </p>
                  <p className="text-sm text-muted">
                    {isDouble || boldEnabled
                      ? octopusCopy.conflict
                      : octopusEnabled
                        ? octopusCopy.selecting
                        : octopusCopy.hint}
                  </p>
                </div>
              </label>

              {octopusEnabled && (
                <div className="rounded-lg border border-cyan-300/25 bg-background/80 p-4">
                  {octopusPlayerId && !matchLockReason && (
                    <p className="mb-2 text-sm text-muted">
                      {octopusCopy.change}
                    </p>
                  )}
                  {hasOctopusGoalkeeperOptions ? (
                    <Select
                      label={octopusCopy.choose}
                      value={octopusPlayerId}
                      onChange={(e) =>
                        handleOctopusPlayerChange(e.target.value)
                      }
                      options={octopusSelectOptions}
                      groups={octopusGoalkeeperGroups}
                      disabled={Boolean(matchLockReason)}
                    />
                  ) : (
                    <p className="text-sm text-muted">{octopusCopy.noKeepers}</p>
                  )}
                  <p className="mt-3 text-xs leading-5 text-muted">
                    {octopusCopy.source}
                  </p>
                  {octopusPlayerId && !matchLockReason && (
                    <button
                      type="button"
                      onClick={handleClearOctopusBet}
                      className="mt-3 text-sm text-muted hover:text-danger"
                    >
                      {octopusCopy.clear}
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
                boldPlayerId={boldPlayerId}
                octopusPlayerId={octopusPlayerId}
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
            loading ||
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
