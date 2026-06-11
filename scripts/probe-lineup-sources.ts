import "dotenv/config";

const FD_KEY = process.env.FOOTBALL_DATA_API_KEY!;
const FD_BASE = process.env.FOOTBALL_DATA_BASE_URL ?? "https://api.football-data.org/v4";
const MATCH_ID = "537327";

async function fd(path: string, extraHeaders: Record<string, string> = {}) {
  const headers: Record<string, string> = {
    "X-Auth-Token": FD_KEY,
    ...extraHeaders,
  };
  const res = await fetch(`${FD_BASE}${path}`, { headers });
  const data = await res.json();
  return { status: res.status, data };
}

const unfoldSets = [
  {},
  { "X-Unfold-Lineups": "true" },
  {
    "X-Unfold-Lineups": "true",
    "X-Unfold-Bookings": "true",
    "X-Unfold-Subs": "true",
  },
];

async function main() {
  for (const headers of unfoldSets) {
    const single = await fd(`/matches/${MATCH_ID}`, headers);
    const ht = single.data.homeTeam;
    console.log("headers", headers, "lineup:", ht?.lineup?.length, "formation:", ht?.formation);
  }

  const comp = await fd("/competitions/WC/matches?status=SCHEDULED,LIVE");
  const m = (comp.data.matches ?? []).find(
    (row: { id: number }) => String(row.id) === MATCH_ID
  );
  if (m) {
    console.log("comp list match home keys:", Object.keys(m.homeTeam ?? {}));
    console.log(
      "comp list lineup:",
      m.homeTeam?.lineup?.length,
      m.awayTeam?.lineup?.length
    );
  } else {
    console.log("match not in comp list, count:", comp.data.matches?.length);
  }

  const mexico = await fd("/teams/769/matches?status=SCHEDULED,LIVE&limit=5");
  const mexMatch = (mexico.data.matches ?? []).find(
    (row: { id: number }) => String(row.id) === MATCH_ID
  );
  if (mexMatch) {
    console.log("team matches list lineup:", mexMatch.homeTeam?.lineup?.length);
  }

  if (process.env.API_FOOTBALL_KEY) {
    const afBase =
      process.env.API_FOOTBALL_BASE_URL ?? "https://v3.football.api-sports.io";
    const res = await fetch(`${afBase}/fixtures?team=16&next=3`, {
      headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY },
    });
    const af = await res.json();
    console.log("api-football mexico next:", JSON.stringify(af.response?.slice(0, 2), null, 2));
  } else {
    console.log("no API_FOOTBALL_KEY");
  }
}

main().catch(console.error);
