"use client";

import { layoutFormation, getPlayerLabel } from "@/lib/formation-layout";
import type { ScorerPicks } from "@/lib/scorer-prediction";
import type { LineupSource, MatchPlayerView } from "@/services/match-players.service";
import { OptimizedImage } from "@/components/ui/OptimizedImage";

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

function statusNote(
  status: LineupSource,
  labels: PitchLineupProps["labels"]
) {
  if (status === "official") return labels.officialNote;
  if (status === "probable") return labels.probableNote;
  return labels.estimatedNote;
}

function statusNoteClass(status: LineupSource) {
  if (status === "official") {
    return "border border-primary/30 bg-primary/10 text-primary";
  }
  if (status === "probable") {
    return "border border-warning/30 bg-warning/10 text-warning";
  }
  return "border border-card-border bg-card text-muted";
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

function PlayerDot({
  player,
  goals,
  selected,
  selectable,
  onToggle,
  style,
}: {
  player: MatchPlayerView;
  goals: number;
  selected: boolean;
  selectable: boolean;
  onToggle: () => void;
  style: React.CSSProperties;
}) {
  const gk = isGoalkeeper(player);

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={!selected && !selectable}
      style={style}
      className={`absolute z-10 flex w-[88px] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 transition-transform sm:w-[104px] ${
        !selected && !selectable
          ? "cursor-not-allowed opacity-45"
          : "hover:scale-105"
      } ${selected ? "scale-105" : ""}`}
    >
      <span className="relative">
        <span
          className={`relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-full text-xs font-bold shadow-lg ${
            selected
              ? "bg-primary text-white ring-2 ring-white"
              : gk
                ? "bg-amber-300 text-emerald-950 ring-1 ring-amber-500"
                : "bg-white/95 text-emerald-900"
          }`}
        >
          {player.photoUrl ? (
            <OptimizedImage
              src={player.photoUrl}
              alt={player.name}
              width={44}
              height={44}
              className="h-full w-full object-cover"
            />
          ) : (
            player.shirtNumber ?? positionFallback(player.position)
          )}
        </span>
        {player.photoUrl && (
          <span className="absolute -bottom-1 -left-1 flex h-5 min-w-5 items-center justify-center rounded-full border border-white/70 bg-emerald-950 px-1 text-[9px] font-black text-white">
            {player.shirtNumber ?? positionFallback(player.position)}
          </span>
        )}
        {selected && goals > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-warning px-0.5 text-[9px] font-bold text-black">
            {goals}
          </span>
        )}
      </span>
      <span
        title={player.name}
        className={`line-clamp-2 min-h-7 max-w-[88px] rounded-md px-1.5 py-0.5 text-center text-[10px] font-semibold leading-3 shadow-sm sm:max-w-[104px] sm:text-[11px] ${
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
}: {
  players: MatchPlayerView[];
  scorerPicks: ScorerPicks;
  canSelectPlayer?: (id: string) => boolean;
  onToggle: (id: string) => void;
  label: string;
}) {
  if (players.length === 0) return null;

  return (
    <div className="mt-3">
      <p className="mb-2 text-xs font-medium text-muted">{label}</p>
      <div className="flex flex-wrap gap-2">
        {players.map((player) => {
          const selected = player.id in scorerPicks;
          const selectable = selected || (canSelectPlayer?.(player.id) ?? true);
          const goals = scorerPicks[player.id] ?? 1;
          return (
            <button
              key={player.id}
              type="button"
              onClick={() => onToggle(player.id)}
              disabled={!selectable}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                selected
                  ? "border-primary bg-primary/15 text-primary"
                  : selectable
                    ? "border-card-border bg-card hover:border-primary/40"
                    : "cursor-not-allowed border-card-border/60 bg-card/50 text-muted opacity-60"
              }`}
            >
              {player.shirtNumber != null && (
                <span className="ml-1 font-bold">{player.shirtNumber}</span>
              )}
              {getPlayerLabel(player)}
              {selected && (
                <span className="mr-1 rounded bg-warning/20 px-1 font-bold text-warning">
                  ×{goals}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
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
  lineupStatus,
  scorerPicks,
  canSelectPlayer,
  maxGoalsForPlayer,
  onToggle,
  onGoalsChange,
  labels,
}: PitchLineupProps) {
  const homeLineup = home.players.filter((p) => p.section === "lineup");
  const awayLineup = away.players.filter((p) => p.section === "lineup");
  const homeBench = home.players.filter((p) => p.section === "bench");
  const awayBench = away.players.filter((p) => p.section === "bench");

  const homeSlots = layoutFormation(homeLineup, home.formation, "home");
  const awaySlots = layoutFormation(awayLineup, away.formation, "away");

  const playersById = new Map<string, MatchPlayerView>();
  for (const p of [...home.players, ...away.players]) {
    playersById.set(p.id, p);
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="font-medium">{labels.title}</p>
        <p className="text-sm text-muted">{labels.hint}</p>
        <p
          className={`mt-2 rounded-lg px-3 py-2 text-xs ${statusNoteClass(lineupStatus)}`}
        >
          {statusNote(lineupStatus, labels)}
        </p>
      </div>

      <div className="overflow-x-auto pb-2">
      <div className="relative mx-auto min-w-[520px] max-w-3xl overflow-hidden rounded-2xl border border-emerald-600/40 shadow-inner">
        <div className="relative aspect-[4/5] w-full bg-gradient-to-b from-emerald-700 via-emerald-600 to-emerald-700">
          <div className="absolute inset-3 rounded-xl border-2 border-white/25" />
          <div className="absolute left-3 right-3 top-1/2 border-t-2 border-white/25" />
          <div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/25" />
          <div className="absolute left-1/2 top-3 h-14 w-36 -translate-x-1/2 rounded-b-lg border-2 border-t-0 border-white/20" />
          <div className="absolute bottom-3 left-1/2 h-14 w-36 -translate-x-1/2 rounded-t-lg border-2 border-b-0 border-white/20" />

          <div className="absolute left-3 top-3 flex flex-wrap items-center gap-2">
            <span className="rounded bg-black/40 px-2 py-1 text-xs font-semibold text-white">
              {home.shortName}
            </span>
            <span
              className={`rounded px-2 py-0.5 text-[10px] ${sourceBadgeClass(home.source)}`}
            >
              {sourceBadgeLabel(home.source, labels)}
            </span>
            {home.formation && (
              <span className="text-[10px] text-white/80">
                {labels.formation} {home.formation}
              </span>
            )}
          </div>

          <div className="absolute bottom-3 right-3 flex flex-wrap items-center justify-end gap-2">
            {away.formation && (
              <span className="text-[10px] text-white/80">
                {labels.formation} {away.formation}
              </span>
            )}
            <span
              className={`rounded px-2 py-0.5 text-[10px] ${sourceBadgeClass(away.source)}`}
            >
              {sourceBadgeLabel(away.source, labels)}
            </span>
            <span className="rounded bg-black/40 px-2 py-1 text-xs font-semibold text-white">
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
            />
          ))}
        </div>
      </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <BenchRow
          players={homeBench}
          scorerPicks={scorerPicks}
          canSelectPlayer={canSelectPlayer}
          onToggle={onToggle}
          label={`${labels.bench} — ${home.teamName}`}
        />
        <BenchRow
          players={awayBench}
          scorerPicks={scorerPicks}
          canSelectPlayer={canSelectPlayer}
          onToggle={onToggle}
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
