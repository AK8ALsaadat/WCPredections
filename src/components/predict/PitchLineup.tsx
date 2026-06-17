"use client";

import Image from "next/image";
import {
  getPlayerLabel,
  layoutFormation,
  layoutFromGrid,
} from "@/lib/formation-layout";
import type { ScorerPicks } from "@/lib/scorer-prediction";
import type { LineupSource, MatchPlayerView } from "@/services/match-players.service";
import { useEffect, useMemo, useState } from "react";

type PitchLineupProps = {
  home: {
    teamName: string;
    shortName: string;
    formation?: string | null;
    players: MatchPlayerView[];
    source: LineupSource;
  };
  away: {
    teamName: string;
    shortName: string;
    formation?: string | null;
    players: MatchPlayerView[];
    source: LineupSource;
  };
  lineupStatus: LineupSource;
  scorerPicks: ScorerPicks;
  canSelectPlayer?: (playerId: string) => boolean;
  maxGoalsForPlayer?: (playerId: string) => number;
  onToggle: (playerId: string) => void;
  onGoalsChange: (playerId: string, goals: number) => void;
  labels: {
    title: string;
    hint: string;
    bench: string;
    formation: string;
    officialBadge: string;
    probableBadge: string;
    estimatedBadge: string;
    officialNote: string;
    probableNote: string;
    estimatedNote: string;
    selectedScorers: string;
    goalsLabel: string;
    remove: string;
  };
};

function sourceBadgeClass(source: LineupSource) {
  if (source === "official") return "bg-primary/80 text-white";
  if (source === "probable") return "bg-warning/80 text-black";
  return "bg-card-border/90 text-muted";
}

function sourceBadgeLabel(
  source: LineupSource,
  labels: PitchLineupProps["labels"]
) {
  if (source === "official") return labels.officialBadge;
  if (source === "probable") return labels.probableBadge;
  return labels.estimatedBadge;
}

function GoalsStepper({
  goals,
  maxGoals,
  onChange,
  label,
}: {
  goals: number;
  maxGoals: number;
  onChange: (goals: number) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="sr-only">{label}</span>
      <button
        type="button"
        onClick={() => onChange(Math.max(1, goals - 1))}
        disabled={goals <= 1}
        className="flex h-7 w-7 items-center justify-center rounded border border-card-border bg-card text-sm font-bold disabled:opacity-40"
        aria-label="-"
      >
        −
      </button>
      <span className="min-w-[1.25rem] text-center text-sm font-bold">{goals}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(maxGoals, goals + 1))}
        disabled={goals >= maxGoals}
        className="flex h-7 w-7 items-center justify-center rounded border border-card-border bg-card text-sm font-bold disabled:opacity-40"
        aria-label="+"
      >
        +
      </button>
    </div>
  );
}

function isGoalkeeper(player: MatchPlayerView) {
  return (player.position ?? "").toLowerCase().includes("goal");
}

function positionFallback(position?: string | null) {
  const value = (position ?? "").toLowerCase();
  if (value.includes("goal")) return "GK";
  if (value.includes("def")) return "DF";
  if (value.includes("mid")) return "MF";
  if (value.includes("attack") || value.includes("forward")) return "FW";
  return "?";
}

function PlayerPortrait({
  player,
  sizeClass,
  enabled,
}: {
  player: MatchPlayerView;
  sizeClass: string;
  enabled: boolean;
}) {
  const photoUrl =
    player.photoUrl ??
    `/api/player-avatar?name=${encodeURIComponent(player.name)}`;
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [photoUrl]);

  if (!enabled || failed) return null;

  return (
    <Image
      src={photoUrl}
      alt=""
      width={96}
      height={128}
      unoptimized
      loading="lazy"
      decoding="async"
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
      className={`absolute inset-0 object-cover object-top transition-opacity duration-150 ${sizeClass} ${
        loaded ? "opacity-100" : "opacity-0"
      }`}
    />
  );
}

function withDisplayNumbers(players: MatchPlayerView[]) {
  const used = new Set(
    players.flatMap((player) =>
      player.shirtNumber == null ? [] : [player.shirtNumber]
    )
  );
  let fallback = 1;
  return players.map((player) => {
    if (player.shirtNumber != null) return player;
    while (used.has(fallback)) fallback++;
    const displayNumber = fallback++;
    used.add(displayNumber);
    return { ...player, shirtNumber: displayNumber };
  });
}

function PlayerDot({
  player,
  goals,
  selected,
  selectable,
  onToggle,
  style,
  showPhotos,
}: {
  player: MatchPlayerView;
  goals: number;
  selected: boolean;
  selectable: boolean;
  onToggle: () => void;
  style: React.CSSProperties;
  showPhotos: boolean;
}) {
  const gk = isGoalkeeper(player);

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={!selected && !selectable}
      style={style}
      className={`absolute z-10 flex w-[58px] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 transition-transform sm:w-[88px] sm:gap-1 md:w-[104px] ${
        !selected && !selectable
          ? "cursor-not-allowed opacity-45"
          : "hover:scale-105"
      } ${selected ? "scale-105" : ""}`}
    >
      <span className="relative">
        <span
          className={`relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-full text-[10px] font-bold shadow-lg sm:h-11 sm:w-11 sm:text-xs ${
            selected
              ? "bg-primary text-white ring-2 ring-white"
              : gk
                ? "bg-amber-300 text-emerald-950 ring-1 ring-amber-500"
                : "bg-white/95 text-emerald-900"
          }`}
        >
          <span className="flex h-full w-full items-center justify-center text-[11px] font-black text-emerald-950 sm:text-[14px]">
            {player.shirtNumber ?? positionFallback(player.position)}
          </span>
          <PlayerPortrait
            player={player}
            sizeClass="h-[130%] w-full origin-top scale-110"
            enabled={showPhotos}
          />
        </span>
        <span className="absolute -bottom-1 -left-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-white/70 bg-emerald-950 px-0.5 text-[8px] font-black text-white sm:h-5 sm:min-w-5 sm:px-1 sm:text-[9px]">
          {player.shirtNumber ?? positionFallback(player.position)}
        </span>
        {selected && goals > 0 && (
          <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-warning px-0.5 text-[8px] font-bold text-black sm:h-4 sm:min-w-4 sm:text-[9px]">
            {goals}
          </span>
        )}
      </span>
      <span
        title={player.name}
        className={`line-clamp-2 min-h-5 max-w-[58px] rounded px-1 py-0.5 text-center text-[8px] font-semibold leading-[10px] shadow-sm sm:min-h-7 sm:max-w-[88px] sm:rounded-md sm:px-1.5 sm:text-[10px] sm:leading-3 md:max-w-[104px] md:text-[11px] ${
          selected ? "bg-primary/90 text-white" : "bg-black/50 text-white"
        }`}
      >
        {getPlayerLabel(player)}
      </span>
    </button>
  );
}

function BenchRow({
  players,
  scorerPicks,
  canSelectPlayer,
  onToggle,
  label,
  showPhotos,
}: {
  players: MatchPlayerView[];
  scorerPicks: ScorerPicks;
  canSelectPlayer?: (id: string) => boolean;
  onToggle: (id: string) => void;
  label: string;
  showPhotos: boolean;
}) {
  if (players.length === 0) return null;

  return (
    <div className="mt-3">
      <p className="mb-2 text-xs font-medium text-muted">{label}</p>
      <div className="flex flex-wrap gap-2">
        {players.map((player) => (
          <BenchPlayerTile
            key={player.id}
            player={player}
            selected={player.id in scorerPicks}
            selectable={player.id in scorerPicks || (canSelectPlayer?.(player.id) ?? true)}
            goals={scorerPicks[player.id] ?? 1}
            onToggle={() => onToggle(player.id)}
            showPhotos={showPhotos}
          />
        ))}
      </div>
    </div>
  );
}

function BenchPlayerTile({
  player,
  selected,
  selectable,
  goals,
  onToggle,
  showPhotos,
}: {
  player: MatchPlayerView;
  selected: boolean;
  selectable: boolean;
  goals: number;
  onToggle: () => void;
  showPhotos: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={!selectable}
      className={`flex items-center gap-2 rounded-full border py-1 pl-3 pr-1 text-xs transition-colors ${
        selected
          ? "border-primary bg-primary/15 text-primary"
          : selectable
            ? "border-card-border bg-card hover:border-primary/40"
            : "cursor-not-allowed border-card-border/60 bg-card/50 text-muted opacity-60"
      }`}
    >
      <span className="relative h-8 w-8 shrink-0">
        <span className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-card-border text-[10px] font-bold">
          <span className="font-black text-sm text-emerald-900">
            {player.shirtNumber ?? positionFallback(player.position)}
          </span>
          <PlayerPortrait
            player={player}
            sizeClass="h-[130%] w-full origin-top scale-110"
            enabled={showPhotos}
          />
        </span>
        <span className="absolute -bottom-1 -left-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-card bg-emerald-950 px-0.5 text-[8px] font-black text-white">
          {player.shirtNumber ?? positionFallback(player.position)}
        </span>
      </span>
      <span>{getPlayerLabel(player)}</span>
      {selected && (
        <span className="rounded bg-warning/20 px-1 font-bold text-warning">×{goals}</span>
      )}
    </button>
  );
}

function SelectedScorersPanel({
  picks,
  playersById,
  maxGoalsForPlayer,
  onGoalsChange,
  onToggle,
  labels,
}: {
  picks: ScorerPicks;
  playersById: Map<string, MatchPlayerView>;
  maxGoalsForPlayer?: (playerId: string) => number;
  onGoalsChange: (playerId: string, goals: number) => void;
  onToggle: (playerId: string) => void;
  labels: PitchLineupProps["labels"];
}) {
  const entries = Object.entries(picks);
  if (entries.length === 0) return null;

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
      <p className="mb-3 text-sm font-medium">{labels.selectedScorers}</p>
      <ul className="space-y-2">
        {entries.map(([playerId, goals]) => {
          const player = playersById.get(playerId);
          if (!player) return null;

          return (
            <li
              key={playerId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-card-border bg-card px-3 py-2"
            >
              <div className="flex items-center gap-2 text-sm">
                {player.shirtNumber != null && (
                  <span className="font-bold text-muted">{player.shirtNumber}</span>
                )}
                <span className="font-medium">{getPlayerLabel(player)}</span>
              </div>
              <div className="flex items-center gap-3">
                <GoalsStepper
                  goals={goals}
                  maxGoals={maxGoalsForPlayer?.(playerId) ?? 9}
                  onChange={(g) => onGoalsChange(playerId, g)}
                  label={labels.goalsLabel}
                />
                <button
                  type="button"
                  onClick={() => onToggle(playerId)}
                  className="text-xs text-muted hover:text-danger"
                >
                  {labels.remove}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function PitchLineup({
  home,
  away,
  scorerPicks,
  canSelectPlayer,
  maxGoalsForPlayer,
  onToggle,
  onGoalsChange,
  labels,
}: PitchLineupProps) {
  const [showPhotos, setShowPhotos] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowPhotos(true), 650);
    return () => clearTimeout(timer);
  }, []);

  const homePlayers = useMemo(
    () => withDisplayNumbers(home.players),
    [home.players]
  );
  const awayPlayers = useMemo(
    () => withDisplayNumbers(away.players),
    [away.players]
  );
  const homeLineup = useMemo(
    () => homePlayers.filter((p) => p.section === "lineup"),
    [homePlayers]
  );
  const awayLineup = useMemo(
    () => awayPlayers.filter((p) => p.section === "lineup"),
    [awayPlayers]
  );
  const homeBench = useMemo(
    () => homePlayers.filter((p) => p.section === "bench"),
    [homePlayers]
  );
  const awayBench = useMemo(
    () => awayPlayers.filter((p) => p.section === "bench"),
    [awayPlayers]
  );
  const homeSlots = useMemo(
    () =>
      (home.source === "official"
        ? layoutFromGrid(homeLineup, "home")
        : null) ?? layoutFormation(homeLineup, home.formation, "home"),
    [homeLineup, home.formation, home.source]
  );
  const awaySlots = useMemo(
    () =>
      (away.source === "official"
        ? layoutFromGrid(awayLineup, "away")
        : null) ?? layoutFormation(awayLineup, away.formation, "away"),
    [awayLineup, away.formation, away.source]
  );
  const playersById = useMemo(
    () =>
      new Map<string, MatchPlayerView>(
        [...homePlayers, ...awayPlayers].map((player) => [player.id, player])
      ),
    [homePlayers, awayPlayers]
  );

  return (
    <div className="space-y-4">
      <div>
        <p className="font-medium">{labels.title}</p>
        <p className="text-sm text-muted">{labels.hint}</p>
      </div>

      <div className="relative mx-auto w-full max-w-3xl overflow-hidden rounded-xl border border-emerald-600/40 shadow-inner sm:rounded-2xl">
        <div className="relative aspect-[3/5] w-full bg-gradient-to-b from-emerald-700 via-emerald-600 to-emerald-700 sm:aspect-[4/5]">
          <div className="absolute inset-2 rounded-lg border border-white/25 sm:inset-3 sm:rounded-xl sm:border-2" />
          <div className="absolute left-2 right-2 top-1/2 border-t border-white/25 sm:left-3 sm:right-3 sm:border-t-2" />
          <div className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25 sm:h-20 sm:w-20 sm:border-2" />
          <div className="absolute left-1/2 top-2 h-10 w-24 -translate-x-1/2 rounded-b-lg border border-t-0 border-white/20 sm:top-3 sm:h-14 sm:w-36 sm:border-2 sm:border-t-0" />
          <div className="absolute bottom-2 left-1/2 h-10 w-24 -translate-x-1/2 rounded-t-lg border border-b-0 border-white/20 sm:bottom-3 sm:h-14 sm:w-36 sm:border-2 sm:border-b-0" />

          <div className="absolute left-2 top-2 flex max-w-[72%] flex-wrap items-center gap-1 sm:left-3 sm:top-3 sm:gap-2">
            <span className="rounded bg-black/40 px-1.5 py-0.5 text-[9px] font-semibold text-white sm:px-2 sm:py-1 sm:text-xs">
              {home.shortName}
            </span>
            <span
              className={`rounded px-1.5 py-0.5 text-[8px] sm:px-2 sm:text-[10px] ${sourceBadgeClass(home.source)}`}
            >
              {sourceBadgeLabel(home.source, labels)}
            </span>
            {home.formation && (
              <span className="text-[8px] text-white/80 sm:text-[10px]">
                {labels.formation} {home.formation}
              </span>
            )}
          </div>

          <div className="absolute bottom-2 right-2 flex max-w-[72%] flex-wrap items-center justify-end gap-1 sm:bottom-3 sm:right-3 sm:gap-2">
            {away.formation && (
              <span className="text-[8px] text-white/80 sm:text-[10px]">
                {labels.formation} {away.formation}
              </span>
            )}
            <span
              className={`rounded px-1.5 py-0.5 text-[8px] sm:px-2 sm:text-[10px] ${sourceBadgeClass(away.source)}`}
            >
              {sourceBadgeLabel(away.source, labels)}
            </span>
            <span className="rounded bg-black/40 px-1.5 py-0.5 text-[9px] font-semibold text-white sm:px-2 sm:py-1 sm:text-xs">
              {away.shortName}
            </span>
          </div>

          {homeSlots.map(({ player, x, y }) => (
            <PlayerDot
              key={`h-${player.id}`}
              player={player}
              goals={scorerPicks[player.id] ?? 1}
              selected={player.id in scorerPicks}
              selectable={
                player.id in scorerPicks ||
                (canSelectPlayer?.(player.id) ?? true)
              }
              onToggle={() => onToggle(player.id)}
              style={{ left: `${x}%`, top: `${y}%` }}
              showPhotos={showPhotos}
            />
          ))}

          {awaySlots.map(({ player, x, y }) => (
            <PlayerDot
              key={`a-${player.id}`}
              player={player}
              goals={scorerPicks[player.id] ?? 1}
              selected={player.id in scorerPicks}
              selectable={
                player.id in scorerPicks ||
                (canSelectPlayer?.(player.id) ?? true)
              }
              onToggle={() => onToggle(player.id)}
              style={{ left: `${x}%`, top: `${y}%` }}
              showPhotos={showPhotos}
            />
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <BenchRow
          players={homeBench}
          scorerPicks={scorerPicks}
          canSelectPlayer={canSelectPlayer}
          onToggle={onToggle}
          showPhotos={showPhotos}
          label={`${labels.bench} — ${home.teamName}`}
        />
        <BenchRow
          players={awayBench}
          scorerPicks={scorerPicks}
          canSelectPlayer={canSelectPlayer}
          onToggle={onToggle}
          showPhotos={showPhotos}
          label={`${labels.bench} — ${away.teamName}`}
        />
      </div>

      <SelectedScorersPanel
        picks={scorerPicks}
        playersById={playersById}
        maxGoalsForPlayer={maxGoalsForPlayer}
        onGoalsChange={onGoalsChange}
        onToggle={onToggle}
        labels={labels}
      />
    </div>
  );
}
