"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { LoadingPage } from "@/components/ui/LoadingSpinner";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { clientFetch } from "@/lib/client-fetch";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { cn, formatDate } from "@/lib/utils";

type MatchOption = {
  id: string;
  matchTime: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  homeTeam: { id: string; name: string; shortName: string; logoUrl?: string | null };
  awayTeam: { id: string; name: string; shortName: string; logoUrl?: string | null };
  round: { id: string; name: string };
};

type LineupPlayer = {
  id: string;
  name: string;
  position?: string | null;
  shirtNumber?: number | null;
  photoUrl?: string | null;
  section: "lineup" | "bench";
};

type PointLine = {
  playerId: string;
  playerName: string;
  label: string;
  points: number;
  minute?: number | null;
  doubled?: boolean;
};

type FanClashState = {
  configured: boolean;
  quotaExhausted: boolean;
  availableApiKeys: number;
  sourceError: string | null;
  match: MatchOption & {
    apiMatchId: string | null;
    statusText: string;
    elapsed: number | null;
  };
  lineup: {
    home: { players: LineupPlayer[]; source: string };
    away: { players: LineupPlayer[]; source: string };
    lineupStatus: string;
  } | null;
  picks: {
    id: string;
    playerId: string;
    playerName: string;
    teamName: string;
    photoUrl?: string | null;
    powerupStartsAt?: string | null;
    powerupEndsAt?: string | null;
    points: number;
    lines: PointLine[];
  }[];
  leaderboard: {
    rank: number;
    userId: string;
    username: string;
    points: number;
  }[];
  feed: PointLine[];
  scoringRules: string[];
};

type PlayerGroup = {
  team: MatchOption["homeTeam"];
  players: LineupPlayer[];
};

function pointsLabel(points: number) {
  return `${points > 0 ? "+" : ""}${points.toFixed(points % 1 === 0 ? 0 : 1)}`;
}

function playerInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function playerMeta(player: LineupPlayer) {
  return [
    player.position ?? player.section,
    player.shirtNumber ? `#${player.shirtNumber}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function isMatchOpen(match: MatchOption) {
  return (
    match.status === "SCHEDULED" &&
    new Date(match.matchTime).getTime() > Date.now()
  );
}

export default function FanClashPage() {
  const { locale } = useI18n();
  const [matches, setMatches] = useState<MatchOption[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState("");
  const [state, setState] = useState<FanClashState | null>(null);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [demoLive, setDemoLive] = useState(false);
  const [panel, setPanel] = useState<"picks" | "leaderboard">("picks");

  const loadMatches = useCallback(async () => {
    const res = await clientFetch("/api/fan-clash");
    if (!res) throw new Error("Request cancelled");
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    setMatches(data.data);
    setSelectedMatchId((current) => {
      if (current) return current;
      const open = data.data.find((match: MatchOption) => isMatchOpen(match));
      return open?.id ?? data.data[0]?.id ?? "";
    });
  }, []);

  const loadState = useCallback(async (matchId: string, silent = false) => {
    if (!matchId) return;
    if (!silent) setLoading(true);
    setError("");
    try {
      const res = await clientFetch(`/api/fan-clash?matchId=${matchId}`);
      if (!res) throw new Error("Request cancelled");
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setState(data.data);
      setSelectedPlayers(data.data.picks.map((pick: { playerId: string }) => pick.playerId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Fan Clash");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMatches().catch((err) => {
      setError(err instanceof Error ? err.message : "Failed to load matches");
      setLoading(false);
    });
  }, [loadMatches]);

  useEffect(() => {
    if (!selectedMatchId) return;
    void loadState(selectedMatchId);
  }, [selectedMatchId, loadState]);

  useEffect(() => {
    if (!selectedMatchId || state?.quotaExhausted) return;
    const interval = setInterval(() => {
      void loadState(selectedMatchId, true);
    }, 120_000);
    return () => clearInterval(interval);
  }, [selectedMatchId, loadState, state?.quotaExhausted]);

  const playerGroups = useMemo(() => {
    if (!state?.lineup) return [] as PlayerGroup[];
    const lineup = state.lineup as FanClashState["lineup"] & {
      homePlayers?: LineupPlayer[];
      awayPlayers?: LineupPlayer[];
    };
    const homePlayers = lineup?.home?.players ?? lineup?.homePlayers ?? [];
    const awayPlayers = lineup?.away?.players ?? lineup?.awayPlayers ?? [];
    return [
      { team: state.match.homeTeam, players: homePlayers },
      { team: state.match.awayTeam, players: awayPlayers },
    ] satisfies PlayerGroup[];
  }, [state]);

  const locked = useMemo(() => {
    if (!state) return true;
    return (
      state.match.status !== "SCHEDULED" ||
      new Date(state.match.matchTime).getTime() <= Date.now()
    );
  }, [state]);

  const selectedLookup = useMemo(
    () => new Set(selectedPlayers),
    [selectedPlayers]
  );
  const openMatchId = useMemo(
    () => matches.find((match) => isMatchOpen(match))?.id ?? "",
    [matches]
  );
  const totalPoints = useMemo(
    () =>
      demoLive
        ? 31.8
        : state?.picks.reduce((sum, pick) => sum + pick.points, 0) ?? 0,
    [demoLive, state]
  );
  const demoFeed = useMemo<PointLine[]>(() => {
    const players = playerGroups.flatMap((group) => group.players);
    const fallback = [
      { id: "demo-1", name: "Demo Striker" },
      { id: "demo-2", name: "Demo Midfielder" },
      { id: "demo-3", name: "Demo Defender" },
      { id: "demo-4", name: "Demo Keeper" },
    ];
    const chosen = players.length >= 4 ? players.slice(0, 4) : fallback;
    return [
      {
        playerId: chosen[0].id,
        playerName: chosen[0].name,
        label: "Goal",
        points: 16,
        minute: 54,
        doubled: true,
      },
      {
        playerId: chosen[1].id,
        playerName: chosen[1].name,
        label: "Assist",
        points: 5,
        minute: 54,
      },
      {
        playerId: chosen[2].id,
        playerName: chosen[2].name,
        label: "Tackles x3",
        points: 4.5,
        minute: 48,
      },
      {
        playerId: chosen[1].id,
        playerName: chosen[1].name,
        label: "Completed passes x42",
        points: 2.1,
        minute: 45,
      },
      {
        playerId: chosen[3].id,
        playerName: chosen[3].name,
        label: "Saves x2",
        points: 4,
        minute: 36,
      },
    ];
  }, [playerGroups]);
  const displayFeed = useMemo(
    () => (demoLive ? demoFeed : state?.feed ?? []),
    [demoFeed, demoLive, state?.feed]
  );
  const latestGoal = useMemo(
    () =>
      displayFeed.find((line) => line.label.toLowerCase().includes("goal")) ??
      null,
    [displayFeed]
  );
  const matchMinutePercent = useMemo(() => {
    const elapsed = demoLive ? 54 : state?.match.elapsed ?? 0;
    return Math.min(100, Math.max(0, (elapsed / 90) * 100));
  }, [demoLive, state?.match.elapsed]);

  function togglePlayer(playerId: string) {
    if (locked || state?.quotaExhausted) return;
    setSelectedPlayers((current) => {
      if (current.includes(playerId)) {
        return current.filter((id) => id !== playerId);
      }
      if (current.length >= 4) return current;
      return [...current, playerId];
    });
  }

  async function savePicks() {
    if (!selectedMatchId) return;
    setSaving(true);
    setError("");
    try {
      const res = await clientFetch("/api/fan-clash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save-picks",
          matchId: selectedMatchId,
          playerIds: selectedPlayers,
        }),
      });
      if (!res) throw new Error("Request cancelled");
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      await loadState(selectedMatchId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save picks");
    } finally {
      setSaving(false);
    }
  }

  async function activatePowerup(playerId: string) {
    if (!selectedMatchId) return;
    setSaving(true);
    setError("");
    try {
      const res = await clientFetch("/api/fan-clash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "powerup",
          matchId: selectedMatchId,
          playerId,
        }),
      });
      if (!res) throw new Error("Request cancelled");
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      await loadState(selectedMatchId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to activate powerup");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !state) return <LoadingPage />;

  return (
    <div dir="ltr" className="mx-auto max-w-7xl space-y-4 text-left">
      <section className="overflow-hidden rounded-lg border border-card-border bg-card">
        <div className="space-y-4 p-3 sm:p-4 lg:p-5">
          <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-normal text-primary">
                Fan Clash
              </p>
              <h1 className="text-2xl font-black sm:text-3xl">
                Live player battle
              </h1>
            </div>
            <Button
              type="button"
              variant={demoLive ? "primary" : "secondary"}
              size="sm"
              onClick={() => setDemoLive((value) => !value)}
              className="w-full sm:w-auto"
            >
              Demo live
            </Button>
          </header>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {matches.slice(0, 8).map((match) => {
              const isOpen = match.id === openMatchId;
              const isSelected = match.id === selectedMatchId;
              return (
                <button
                  key={match.id}
                  type="button"
                  disabled={!isOpen}
                  onClick={() => {
                    if (!isOpen) return;
                    setSelectedMatchId(match.id);
                    setPanel("picks");
                  }}
                  className={cn(
                    "min-h-28 rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed",
                    isSelected
                      ? "border-primary bg-primary/10"
                      : "border-card-border bg-background",
                    !isOpen && "opacity-45 grayscale"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "rounded-md px-2 py-1 text-[11px] font-black uppercase",
                        isOpen
                          ? "bg-primary/15 text-primary"
                          : "bg-card text-muted"
                      )}
                    >
                      {isOpen ? "Open" : "Locked"}
                    </span>
                    <span className="text-xs text-muted">
                      {formatDate(match.matchTime, locale)}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <TeamLogo {...match.homeTeam} size="sm" />
                      <span className="truncate text-sm font-black">
                        {match.homeTeam.shortName}
                      </span>
                    </div>
                    <span className="text-xs font-black text-muted">vs</span>
                    <div className="flex min-w-0 items-center justify-end gap-2">
                      <span className="truncate text-right text-sm font-black">
                        {match.awayTeam.shortName}
                      </span>
                      <TeamLogo {...match.awayTeam} size="sm" />
                    </div>
                  </div>
                  {!isOpen && (
                    <p className="mt-3 text-xs text-muted">
                      Opens after the current nearest match.
                    </p>
                  )}
                </button>
              );
            })}
          </section>

          <div className="grid grid-cols-2 gap-2 rounded-lg border border-card-border bg-background p-1">
            <button
              type="button"
              onClick={() => setPanel("picks")}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-black transition-colors",
                panel === "picks" ? "bg-primary text-white" : "text-muted"
              )}
            >
              Picks
            </button>
            <button
              type="button"
              onClick={() => setPanel("leaderboard")}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-black transition-colors",
                panel === "leaderboard" ? "bg-primary text-white" : "text-muted"
              )}
            >
              Leaderboard
            </button>
          </div>

          {state && (
            <section className="fan-clash-scoreboard rounded-lg border border-card-border bg-background p-3 sm:p-4">
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                <div className="flex min-w-0 flex-col items-center gap-2 sm:flex-row">
                  <TeamLogo {...state.match.homeTeam} size="md" />
                  <span className="max-w-full truncate text-center text-sm font-black sm:text-left sm:text-base">
                    {state.match.homeTeam.name}
                  </span>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-black tabular-nums sm:text-5xl">
                    {state.match.homeScore ?? 0} - {state.match.awayScore ?? 0}
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {state.match.elapsed != null
                      ? `${state.match.elapsed} min`
                      : formatDate(state.match.matchTime, locale)}
                    {" "}· {state.match.statusText}
                  </div>
                </div>
                <div className="flex min-w-0 flex-col items-center gap-2 sm:flex-row sm:justify-end">
                  <span className="max-w-full truncate text-center text-sm font-black sm:text-right sm:text-base">
                    {state.match.awayTeam.name}
                  </span>
                  <TeamLogo {...state.match.awayTeam} size="md" />
                </div>
              </div>
              {(state.match.status === "LIVE" || demoLive) && (
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-card-border">
                  <div
                    className="fan-clash-minute-bar h-full rounded-full bg-primary"
                    style={{ width: `${matchMinutePercent}%` }}
                  />
                </div>
              )}
            </section>
          )}

          {demoLive && (
            <div className="rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm text-primary">
              Demo live is running locally: goal, assist, passes, tackles, saves, points, and animations are simulated without API calls.
            </div>
          )}

          {error && <ErrorMessage message={error} />}

          {state && !state.configured && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
              FAN_CLASH_API_FOOTBALL_KEYS is missing. Add Fan Clash keys to .env.
            </div>
          )}

          {state?.sourceError && (
            <div
              className={cn(
                "rounded-lg border p-3 text-sm",
                state.quotaExhausted
                  ? "border-danger/50 bg-danger/10 text-danger"
                  : "border-warning/40 bg-warning/10 text-warning"
              )}
            >
              {state.quotaExhausted
                ? "Fan Clash is paused because all dedicated API keys reached today's limit."
                : `Live provider warning: ${state.sourceError}`}
            </div>
          )}

          {latestGoal && !state?.quotaExhausted && (
            <section className="fan-clash-goal-banner rounded-lg border border-primary/50 bg-primary/10 p-3 sm:p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-normal text-primary">
                    Goal impact
                  </p>
                  <p className="truncate text-lg font-black">
                    {latestGoal.playerName}
                  </p>
                  <p className="text-sm text-muted">
                    {latestGoal.minute} min · {latestGoal.label}
                    {latestGoal.doubled ? " · Powerup x2" : ""}
                  </p>
                </div>
                <span className="text-3xl font-black text-primary tabular-nums">
                  {pointsLabel(latestGoal.points)}
                </span>
              </div>
            </section>
          )}

          {state?.quotaExhausted && (
            <section className="rounded-lg border border-danger/50 bg-background p-5 text-center">
              <p className="text-lg font-black text-danger">Fan Clash paused</p>
              <p className="mt-2 text-sm text-muted">
                Live refresh stopped to protect the app. Add a fresh Fan Clash key
                or wait for the daily quota reset.
              </p>
            </section>
          )}

          {panel === "picks" && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <main className="space-y-4">
              <section className="rounded-lg border border-card-border bg-background p-3 sm:p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-xl font-black">Pick 4 players</h2>
                    <p className="text-sm text-muted">
                      {locked
                        ? "Picks lock when the match starts. Choose an upcoming match to edit picks."
                        : "Choose your squad before kickoff. Powerup is one player for 10 minutes."}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-md border border-card-border px-2 py-1 text-xs text-muted">
                      {selectedPlayers.length}/4
                    </span>
                    <Button
                      size="sm"
                      onClick={savePicks}
                      loading={saving}
                      disabled={
                        state?.quotaExhausted ||
                        locked ||
                        selectedPlayers.length === 0
                      }
                    >
                      Save picks
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  {playerGroups.map((group) => (
                    <div key={group.team.id} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <TeamLogo {...group.team} size="sm" />
                        <h3 className="font-black">{group.team.name}</h3>
                      </div>
                      <div className="grid gap-2">
                        {group.players.map((player) => {
                          const selected = selectedLookup.has(player.id);
                          const selectionLimitReached =
                            selectedPlayers.length >= 4 && !selected;
                          return (
                            <button
                              key={player.id}
                              type="button"
                              onClick={() => togglePlayer(player.id)}
                              disabled={
                                state?.quotaExhausted ||
                                locked ||
                                selectionLimitReached
                              }
                              className={cn(
                                "flex min-h-16 items-center gap-3 rounded-lg border bg-card p-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                                selected
                                  ? "border-primary bg-primary/10"
                                  : "border-card-border hover:border-muted",
                                selectionLimitReached && "opacity-35 grayscale"
                              )}
                            >
                              <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-card-border bg-background text-xs font-black">
                                {player.photoUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={player.photoUrl}
                                    alt=""
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  playerInitials(player.name)
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-black">
                                  {player.name}
                                </p>
                                <p className="truncate text-xs text-muted">
                                  {playerMeta(player)}
                                </p>
                              </div>
                              <span
                                className={cn(
                                  "rounded-md px-2 py-1 text-xs font-black",
                                  selected
                                    ? "bg-primary text-white"
                                    : "bg-background text-muted"
                                )}
                              >
                                {selected ? "Picked" : "+ Add"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </main>

            <aside className="space-y-4">
              <section className="rounded-lg border border-card-border bg-background p-4">
                <p className="text-xs font-black uppercase tracking-normal text-muted">
                  Your score
                </p>
                <div className="mt-1 text-5xl font-black tabular-nums">
                  {pointsLabel(totalPoints)}
                </div>
                <p className="mt-1 text-xs text-muted">
                  API keys available: {state?.availableApiKeys ?? 0}
                </p>
              </section>

              {state?.picks.map((pick) => (
                <section
                  key={pick.id}
                  className={cn(
                    "fan-clash-pick-card rounded-lg border bg-background p-3",
                    pick.lines.some((line) =>
                      line.label.toLowerCase().includes("goal")
                    )
                      ? "border-primary/50"
                      : "border-card-border"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-black">{pick.playerName}</p>
                      <p className="text-xs text-muted">{pick.teamName}</p>
                    </div>
                    <span
                      className={cn(
                        "text-lg font-black tabular-nums",
                        pick.points >= 0 ? "text-primary" : "text-danger"
                      )}
                    >
                      {pointsLabel(pick.points)}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-xs text-muted">
                      {pick.powerupStartsAt
                        ? `Powerup ${new Date(pick.powerupStartsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                        : "Powerup unused"}
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => activatePowerup(pick.playerId)}
                      loading={saving}
                      disabled={state?.quotaExhausted || !!pick.powerupStartsAt}
                    >
                      10 min x2
                    </Button>
                  </div>
                  {pick.lines.slice(0, 4).map((line, index) => (
                    <div
                      key={`${line.label}-${index}`}
                      className="mt-2 flex justify-between gap-2 text-xs"
                    >
                      <span className="min-w-0 truncate text-muted">
                        {line.minute ? `${line.minute} min ` : ""}
                        {line.label}
                        {line.doubled ? " x2" : ""}
                      </span>
                      <span className={line.points >= 0 ? "text-primary" : "text-danger"}>
                        {pointsLabel(line.points)}
                      </span>
                    </div>
                  ))}
                </section>
              ))}
            </aside>
          </div>
          )}

          {panel === "leaderboard" && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <section className="rounded-lg border border-card-border bg-background p-4">
              <h2 className="font-black">Live feed</h2>
              <div className="mt-3 space-y-2">
                {displayFeed.length ? (
                  displayFeed.map((line, index) => (
                    <div
                      key={`${line.playerId}-${line.label}-${index}`}
                      className={cn(
                        "fan-clash-feed-row flex min-h-14 items-center justify-between gap-3 rounded-md border border-card-border bg-card px-3 py-2",
                        line.label.toLowerCase().includes("goal") &&
                          "fan-clash-goal-pop"
                      )}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black">
                          {line.playerName}
                        </p>
                        <p className="truncate text-xs text-muted">
                          {line.minute} min · {line.label}
                          {line.doubled ? " · Powerup" : ""}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "font-black tabular-nums",
                          line.points >= 0 ? "text-primary" : "text-danger"
                        )}
                      >
                        {pointsLabel(line.points)}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="rounded-md border border-card-border bg-card px-3 py-8 text-center text-sm text-muted">
                    No live Fan Clash events returned yet.
                  </p>
                )}
              </div>
            </section>

            <div className="space-y-4">
              <section className="rounded-lg border border-card-border bg-background p-4">
                <h2 className="font-black">Leaderboard</h2>
                <div className="mt-3 space-y-2">
                  {state?.leaderboard.length ? (
                    state.leaderboard.map((entry) => (
                      <div
                        key={entry.userId}
                        className="flex items-center justify-between gap-3 rounded-md border border-card-border bg-card px-3 py-2"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-sm font-black text-primary">
                            {entry.rank}
                          </span>
                          <span className="truncate font-black">{entry.username}</span>
                        </div>
                        <span className="font-black tabular-nums">
                          {pointsLabel(entry.points)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-md border border-card-border bg-card px-3 py-8 text-center text-sm text-muted">
                      Save picks to join this Fan Clash.
                    </p>
                  )}
                </div>
              </section>

              <section className="rounded-lg border border-card-border bg-background p-4">
                <h2 className="font-black">Scoring</h2>
                <ul className="mt-3 space-y-1 text-sm text-muted">
                  {state?.scoringRules.map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
          )}
        </div>
      </section>
    </div>
  );
}
