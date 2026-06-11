const key = "d4c4be3450ed47a29804f09ecf6cea26";
const headers = { "X-Auth-Token": key };

const matches = await fetch(
  "https://api.football-data.org/v4/competitions/WC/matches?season=2026",
  { headers }
).then((r) => r.json());

const teams = await fetch(
  "https://api.football-data.org/v4/competitions/WC/teams?season=2026",
  { headers }
).then((r) => r.json());

const ids = new Set(teams.teams.map((t: { id: number }) => String(t.id)));
const missing = matches.matches.filter(
  (m: { homeTeam: { id: number }; awayTeam: { id: number } }) =>
    !ids.has(String(m.homeTeam.id)) || !ids.has(String(m.awayTeam.id))
);

console.log("total", matches.matches.length);
console.log("missing", missing.length);
console.log(
  "samples",
  missing.slice(0, 5).map(
    (m: {
      homeTeam: { name: string; id: number };
      awayTeam: { name: string; id: number };
      stage: string;
    }) => `${m.stage}: ${m.homeTeam.name}(${m.homeTeam.id}) vs ${m.awayTeam.name}(${m.awayTeam.id})`
  )
);
