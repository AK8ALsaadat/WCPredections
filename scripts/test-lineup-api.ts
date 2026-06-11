import "dotenv/config";

const key = process.env.FOOTBALL_DATA_API_KEY!;
const teamId = process.argv[2] ?? "774";

async function main() {
  const list = await fetch(
    `https://api.football-data.org/v4/teams/${teamId}/matches?limit=20`,
    { headers: { "X-Auth-Token": key } }
  ).then((r) => r.json());

  console.log("matches:", list.matches?.length ?? 0);
  for (const match of list.matches ?? []) {
    console.log(match.id, match.status, match.competition?.name, match.utcDate);
  }

  const finished = (list.matches ?? []).filter(
    (m: { status: string }) => m.status === "FINISHED"
  );
  console.log("finished:", finished.length);

  for (const match of finished.slice(0, 5)) {
    const detail = await fetch(
      `https://api.football-data.org/v4/matches/${match.id}`,
      {
        headers: {
          "X-Auth-Token": key,
          "X-Unfold-Lineups": "true",
        },
      }
    ).then((r) => r.json());

    const homeId = String(detail.homeTeam?.id);
    const team =
      homeId === teamId ? detail.homeTeam : detail.awayTeam;

    if ((team?.lineup?.length ?? 0) >= 11) {
      console.log(
        JSON.stringify(
          {
            matchId: match.id,
            formation: team.formation,
            lineup: team.lineup.map(
              (p: { name: string; shirtNumber?: number; position?: string }) => ({
                name: p.name,
                shirtNumber: p.shirtNumber,
                position: p.position,
              })
            ),
          },
          null,
          2
        )
      );
      return;
    }
  }

  const squad = await fetch(
    `https://api.football-data.org/v4/teams/${teamId}`,
    { headers: { "X-Auth-Token": key } }
  ).then((r) => r.json());

  console.log(
    "squad sample:",
    squad.squad?.slice(0, 5).map(
      (p: { name: string; position?: string; shirtNumber?: number }) => ({
        name: p.name,
        position: p.position,
        shirtNumber: p.shirtNumber,
      })
    )
  );
}

main().catch(console.error);
