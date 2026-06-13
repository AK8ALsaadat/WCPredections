import "dotenv/config";
import dotenv from "dotenv";

// ensure .env.local is loaded if present
dotenv.config({ path: ".env.local", override: true });
import { fetchApiFootballSquad } from "@/services/api-football-lineup.service";
import { prisma } from "@/lib/prisma";

function normalizeName(name: string) {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactName(name: string) {
  return normalizeName(name).replace(/\s+/g, "");
}

function editDistance(left: string, right: string): number {
  const row = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 1; i <= left.length; i++) {
    let diag = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const prev = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diag + (left[i - 1] === right[j - 1] ? 0 : 1));
      diag = prev;
    }
  }
  return row[right.length];
}

function similarity(a: string, b: string) {
  const A = compactName(a);
  const B = compactName(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  return 1 - editDistance(A, B) / Math.max(A.length, B.length);
}

async function main() {
  console.log("Starting API-Football enrichment...");

  const teams = await prisma.team.findMany();
  console.log(`Found ${teams.length} teams in DB`);

  // quick connectivity test
  try {
    const testRes = await fetch(
      `https://v3.football.api-sports.io/teams?name=Brazil`,
      { headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY! } }
    );
    console.log(`API-Football test status: ${testRes.status}`);
    try {
      const j = await testRes.json();
      console.log("API-Football test response keys:", Object.keys(j));
    } catch (e) {
      console.warn("API-Football test JSON parse failed", String(e));
    }
  } catch (e) {
    console.warn("API-Football test fetch failed", String(e));
  }

  let totalUpdated = 0;

  for (const team of teams) {
    try {
      // try a direct team search to diagnose resolution
      try {
        const teamSearch = await fetch(`https://v3.football.api-sports.io/teams?search=${encodeURIComponent(team.name)}`, { headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY! } });
        const tjson = await teamSearch.json().catch(() => null);
        const found = Array.isArray(tjson?.response) ? tjson.response.length : 0;
        // console.log(`  search results: ${found}`);
      } catch (e) {
        // ignore
      }

      const squad = await fetchApiFootballSquad(team.name);
      console.log(`Team: ${team.name} — squad players: ${squad.length}`);
      if (!squad || squad.length === 0) continue;

      for (const p of squad) {
        const photo = p.photo ?? `https://media.api-sports.io/football/players/${p.id}.png`;
        try {
          // try exact apiPlayerId match first
          let res = await prisma.player.updateMany({
            where: { teamId: team.id, apiPlayerId: String(p.id), photoUrl: null },
            data: { photoUrl: photo },
          });
          if (res.count > 0) {
            totalUpdated += res.count;
            console.log(`  updated ${res.count} player(s) by apiPlayerId for ${p.name}`);
            continue;
          }

          // otherwise load candidates by team and try name similarity
          const candidates = await prisma.player.findMany({ where: { teamId: team.id } });
          let best: { player: any; score: number } | null = null;
          for (const c of candidates) {
            const score = similarity(c.name, p.name);
            if (!best || score > best.score) best = { player: c, score };
          }

          if (best && best.score >= 0.78 && best.player.photoUrl == null) {
            const upd = await prisma.player.update({
              where: { id: best.player.id },
              data: { photoUrl: photo, apiPlayerId: String(p.id) },
            });
            totalUpdated += 1;
            console.log(`  matched '${p.name}' -> '${best.player.name}' (score=${best.score.toFixed(2)}), updated`);
          } else {
            // no confident match
            // console.log(`  no confident match for ${p.name} (best=${best?.player.name} score=${best?.score})`);
          }
        } catch (err) {
          console.warn(`  failed to update player ${p.name}: ${String(err)}`);
        }
      }
    } catch (err) {
      console.warn(`Team ${team.name} failed: ${String(err)}`);
    }
  }

  console.log(`Done. Total players updated: ${totalUpdated}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
