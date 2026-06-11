"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { LoadingPage } from "@/components/ui/LoadingSpinner";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { formatDate, parseOptionalScore } from "@/lib/utils";

type Round = { id: string; name: string; _count: { matches: number } };
type Team = { id: string; name: string; shortName: string; _count: { players: number } };
type Match = {
  id: string;
  matchTime: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  homeTeam: { shortName: string };
  awayTeam: { shortName: string };
};

type MatchEditForm = {
  homeScore?: string;
  awayScore?: string;
  status?: string;
  finishType?: string;
  penaltyWinner?: string;
};

export default function AdminPage() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [roundForm, setRoundForm] = useState({ name: "", startsAt: "", endsAt: "" });
  const [teamForm, setTeamForm] = useState({ name: "", shortName: "", logoUrl: "" });
  const [playerForm, setPlayerForm] = useState({ teamId: "", name: "" });
  const [syncForm, setSyncForm] = useState({
    roundId: "",
    leagueId: "",
    season: "",
    dateFrom: "",
    dateTo: "",
  });
  const [matchEdit, setMatchEdit] = useState<Record<string, MatchEditForm>>({});

  async function loadData() {
    const [roundsRes, teamsRes, matchesRes] = await Promise.all([
      fetch("/api/admin/rounds"),
      fetch("/api/admin/teams"),
      fetch("/api/matches"),
    ]);

    const [roundsData, teamsData, matchesData] = await Promise.all([
      roundsRes.json(),
      teamsRes.json(),
      matchesRes.json(),
    ]);

    if (roundsData.success) setRounds(roundsData.data);
    if (teamsData.success) setTeams(teamsData.data);
    if (matchesData.success) setMatches(matchesData.data);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  async function apiCall(url: string, method: string, body?: unknown) {
    setError("");
    setMessage("");
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!data.success) {
      setError(data.error);
      return null;
    }
    return data.data;
  }

  async function createRound(e: React.FormEvent) {
    e.preventDefault();
    const result = await apiCall("/api/admin/rounds", "POST", {
      name: roundForm.name,
      startsAt: new Date(roundForm.startsAt).toISOString(),
      endsAt: new Date(roundForm.endsAt).toISOString(),
    });
    if (result) {
      setMessage("Round created");
      setRoundForm({ name: "", startsAt: "", endsAt: "" });
      loadData();
    }
  }

  async function createTeam(e: React.FormEvent) {
    e.preventDefault();
    const result = await apiCall("/api/admin/teams", "POST", {
      name: teamForm.name,
      shortName: teamForm.shortName,
      logoUrl: teamForm.logoUrl || null,
    });
    if (result) {
      setMessage("Team created");
      setTeamForm({ name: "", shortName: "", logoUrl: "" });
      loadData();
    }
  }

  async function createPlayer(e: React.FormEvent) {
    e.preventDefault();
    const result = await apiCall("/api/admin/players", "POST", playerForm);
    if (result) {
      setMessage("Player created");
      setPlayerForm({ teamId: "", name: "" });
      loadData();
    }
  }

  async function syncMatches(e: React.FormEvent) {
    e.preventDefault();
    const result = await apiCall("/api/admin/sync", "POST", syncForm);
    if (result) {
      setMessage(
        `Synced: ${result.matchesCreated} created, ${result.matchesUpdated} updated, ${result.pointsCalculated} points calculated`
      );
      loadData();
    }
  }

  async function updateMatch(matchId: string) {
    const edit = matchEdit[matchId];
    if (!edit) return;

    const result = await apiCall(`/api/admin/matches/${matchId}`, "PATCH", {
      homeScore: parseOptionalScore(edit.homeScore),
      awayScore: parseOptionalScore(edit.awayScore),
      status: edit.status || undefined,
      actualFinishType: edit.finishType || null,
      penaltyWinnerTeamId: edit.penaltyWinner || null,
    });

    if (result) {
      setMessage("Match updated and points recalculated");
      loadData();
    }
  }

  async function calculatePoints(type: "match" | "round", id: string) {
    const body = type === "match" ? { matchId: id } : { roundId: id };
    const result = await apiCall("/api/admin/calculate-points", "POST", body);
    if (result) setMessage(result.message);
  }

  if (loading) return <LoadingPage />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-warning">Admin Dashboard</h1>
        <p className="mt-1 text-muted">Manage rounds, teams, matches, and sync data</p>
      </div>

      {message && (
        <div className="rounded-lg border border-primary/50 bg-primary/10 px-4 py-3 text-sm text-primary">
          {message}
        </div>
      )}
      {error && <ErrorMessage message={error} />}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Create Round</CardTitle></CardHeader>
          <form onSubmit={createRound} className="space-y-3">
            <Input label="Name" value={roundForm.name} onChange={(e) => setRoundForm({ ...roundForm, name: e.target.value })} required />
            <Input label="Starts At" type="datetime-local" value={roundForm.startsAt} onChange={(e) => setRoundForm({ ...roundForm, startsAt: e.target.value })} required />
            <Input label="Ends At" type="datetime-local" value={roundForm.endsAt} onChange={(e) => setRoundForm({ ...roundForm, endsAt: e.target.value })} required />
            <Button type="submit">Create Round</Button>
          </form>
        </Card>

        <Card>
          <CardHeader><CardTitle>Create Team</CardTitle></CardHeader>
          <form onSubmit={createTeam} className="space-y-3">
            <Input label="Name" value={teamForm.name} onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })} required />
            <Input label="Short Name" value={teamForm.shortName} onChange={(e) => setTeamForm({ ...teamForm, shortName: e.target.value })} required />
            <Input label="Logo URL" value={teamForm.logoUrl} onChange={(e) => setTeamForm({ ...teamForm, logoUrl: e.target.value })} />
            <Button type="submit">Create Team</Button>
          </form>
        </Card>

        <Card>
          <CardHeader><CardTitle>Add Player</CardTitle></CardHeader>
          <form onSubmit={createPlayer} className="space-y-3">
            <Select
              label="Team"
              value={playerForm.teamId}
              onChange={(e) => setPlayerForm({ ...playerForm, teamId: e.target.value })}
              options={[
                { value: "", label: "Select team..." },
                ...teams.map((t) => ({ value: t.id, label: t.name })),
              ]}
            />
            <Input label="Player Name" value={playerForm.name} onChange={(e) => setPlayerForm({ ...playerForm, name: e.target.value })} required />
            <Button type="submit">Add Player</Button>
          </form>
        </Card>

        <Card>
          <CardHeader><CardTitle>Sync from Football API</CardTitle></CardHeader>
          <form onSubmit={syncMatches} className="space-y-3">
            <Select
              label="Round"
              value={syncForm.roundId}
              onChange={(e) => setSyncForm({ ...syncForm, roundId: e.target.value })}
              options={[
                { value: "", label: "Select round..." },
                ...rounds.map((r) => ({ value: r.id, label: r.name })),
              ]}
            />
            <Input label="League ID" value={syncForm.leagueId} onChange={(e) => setSyncForm({ ...syncForm, leagueId: e.target.value })} placeholder="e.g. 39 for Premier League" />
            <Input label="Season" value={syncForm.season} onChange={(e) => setSyncForm({ ...syncForm, season: e.target.value })} placeholder="e.g. 2025" />
            <Input label="Date From" value={syncForm.dateFrom} onChange={(e) => setSyncForm({ ...syncForm, dateFrom: e.target.value })} placeholder="YYYY-MM-DD" />
            <Input label="Date To" value={syncForm.dateTo} onChange={(e) => setSyncForm({ ...syncForm, dateTo: e.target.value })} placeholder="YYYY-MM-DD" />
            <Button type="submit">Sync Matches</Button>
          </form>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Rounds ({rounds.length})</CardTitle></CardHeader>
        <div className="space-y-2">
          {rounds.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-lg border border-card-border p-3">
              <div>
                <p className="font-medium">{r.name}</p>
                <p className="text-sm text-muted">{r._count.matches} matches</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => calculatePoints("round", r.id)}>
                Calc Points
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader><CardTitle>Teams ({teams.length})</CardTitle></CardHeader>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((t) => (
            <div key={t.id} className="rounded-lg border border-card-border p-3">
              <p className="font-medium">{t.name}</p>
              <p className="text-sm text-muted">{t.shortName} · {t._count.players} players</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader><CardTitle>Manage Matches</CardTitle></CardHeader>
        <div className="space-y-4">
          {matches.map((m) => (
            <div key={m.id} className="rounded-lg border border-card-border p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="font-medium">
                    {m.homeTeam.shortName} vs {m.awayTeam.shortName}
                  </p>
                  <p className="text-sm text-muted">{formatDate(m.matchTime)} · {m.status}</p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => calculatePoints("match", m.id)}>
                  Calc Points
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-4">
                <Input
                  label="Home"
                  type="number"
                  value={matchEdit[m.id]?.homeScore ?? String(m.homeScore ?? "")}
                  onChange={(e) => setMatchEdit({ ...matchEdit, [m.id]: { ...matchEdit[m.id], homeScore: e.target.value } })}
                />
                <Input
                  label="Away"
                  type="number"
                  value={matchEdit[m.id]?.awayScore ?? String(m.awayScore ?? "")}
                  onChange={(e) => setMatchEdit({ ...matchEdit, [m.id]: { ...matchEdit[m.id], awayScore: e.target.value } })}
                />
                <Select
                  label="Status"
                  value={matchEdit[m.id]?.status ?? m.status}
                  onChange={(e) => setMatchEdit({ ...matchEdit, [m.id]: { ...matchEdit[m.id], status: e.target.value } })}
                  options={[
                    { value: "SCHEDULED", label: "Scheduled" },
                    { value: "LIVE", label: "Live" },
                    { value: "FINISHED", label: "Finished" },
                    { value: "POSTPONED", label: "Postponed" },
                    { value: "CANCELLED", label: "Cancelled" },
                  ]}
                />
                <Select
                  label="Finish Type"
                  value={matchEdit[m.id]?.finishType ?? ""}
                  onChange={(e) => setMatchEdit({ ...matchEdit, [m.id]: { ...matchEdit[m.id], finishType: e.target.value } })}
                  options={[
                    { value: "", label: "N/A" },
                    { value: "NINETY_MINUTES", label: "90 Min" },
                    { value: "EXTRA_TIME", label: "Extra Time" },
                    { value: "PENALTIES", label: "Penalties" },
                  ]}
                />
              </div>
              <Button size="sm" className="mt-3" onClick={() => updateMatch(m.id)}>
                Update Match
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
