"use client";

import { layoutFormation, getPlayerLabel } from "@/lib/formation-layout";
import type { ScorerPicks } from "@/lib/scorer-prediction";
import type { LineupSource, MatchPlayerView } from "@/services/match-players.service";

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
  onChange,
  label,
}: {
  goals: number;
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
        onClick={() => onChange(Math.min(9, goals + 1))}
        disabled={goals >= 9}
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

function PlayerDot({
  player,
  goals,
  selected,
  onToggle,
  style,
}: {
  player: MatchPlayerView;
  goals: number;
  selected: boolean;
  onToggle: () => void;
  style: React.CSSProperties;
}) {
  const gk = isGoalkeeper(player);

  return (
    <button
      type="button"
      onClick={onToggle}
      style={style}
      className={`absolute z-10 flex w-[72px] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 transition-transform hover:scale-105 ${
        selected ? "scale-105" : ""
      }`}
    >
      <span className="relative">
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold shadow-md ${
            selected
              ? "bg-primary text-white ring-2 ring-white"
              : gk
                ? "bg-amber-300 text-emerald-950 ring-1 ring-amber-500"
                : "bg-white/95 text-emerald-900"
          }`}
        >
          {player.shirtNumber ?? "·"}
        </span>
        {selected && goals > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-warning px-0.5 text-[9px] font-bold text-black">
            {goals}
          </span>
        )}
      </span>
      <span
        className={`max-w-[72px] truncate rounded px-1 text-center text-[10px] font-medium leading-tight ${
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
  onToggle,
  label,
}: {
  players: MatchPlayerView[];
  scorerPicks: ScorerPicks;
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
          const goals = scorerPicks[player.id] ?? 1;
          return (
            <button
              key={player.id}
              type="button"
              onClick={() => onToggle(player.id)}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                selected
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-card-border bg-card hover:border-primary/40"
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
  onGoalsChange,
  onToggle,
  labels,
}: {
  picks: ScorerPicks;
  playersById: Map<string, MatchPlayerView>;
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

      <div className="relative mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-emerald-600/40 shadow-inner">
        <div className="relative aspect-[2/3] w-full bg-gradient-to-b from-emerald-700 via-emerald-600 to-emerald-700">
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
              onToggle={() => onToggle(player.id)}
              style={{ left: `${x}%`, top: `${y}%` }}
            />
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <BenchRow
          players={homeBench}
          scorerPicks={scorerPicks}
          onToggle={onToggle}
          label={`${labels.bench} — ${home.teamName}`}
        />
        <BenchRow
          players={awayBench}
          scorerPicks={scorerPicks}
          onToggle={onToggle}
          label={`${labels.bench} — ${away.teamName}`}
        />
      </div>

      <SelectedScorersPanel
        picks={scorerPicks}
        playersById={playersById}
        onGoalsChange={onGoalsChange}
        onToggle={onToggle}
        labels={labels}
      />
    </div>
  );
}
