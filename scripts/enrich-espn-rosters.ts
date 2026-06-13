import "dotenv/config";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", override: true });

import { prisma } from "@/lib/prisma";
import { fetchEspnRoster } from "@/services/espn-roster.service";
import { playerNamesMatch } from "@/lib/player-matching";

const TEAM_NAME_ALIASES: Record<string, string> = {
  turkey: "Türkiye",
  curacao: "Curaçao",
  usa: "United States",
};

const PLAYER_NAME_ALIASES: Record<string, string> = {
  "evren eren elmalı": "Eren Elmali",
  "han-bum lee": "Lee Han-Beom",
  "jin-seob park": "Park Jin-Seop",
  "joon-ho bae": "Bae Jun-Ho",
  "hwang heechan": "Hwang Hee-Chan",
  "hyun-gyu oh": "Oh Hyeon-Gyu",
};

function normalizedTokens(name: string) {
  return name
    .replace(/ı/g, "i")
    .replace(/İ/g, "I")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .sort()
    .join("");
}

function rosterNamesMatch(left: string, right: string) {
  return (
    playerNamesMatch(left, right) ||
    normalizedTokens(left) === normalizedTokens(right)
  );
}

async function main() {
  const targetTeams = new Set(
    (process.env.TARGET_TEAMS ?? "")
      .split(",")
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean)
  );
  const teams = await prisma.team.findMany({
    where: {
      players: { some: {} },
    },
    select: {
      id: true,
      name: true,
      players: {
        select: {
          id: true,
          name: true,
          shirtNumber: true,
          photoUrl: true,
        },
      },
    },
  });

  let updated = 0;
  for (const team of teams) {
    if (targetTeams.size > 0 && !targetTeams.has(team.name.toLowerCase())) {
      continue;
    }
    const roster = await fetchEspnRoster(
      TEAM_NAME_ALIASES[team.name.toLowerCase()] ?? team.name
    );
    if (roster.length === 0) continue;

    for (const player of team.players) {
      const playerName =
        PLAYER_NAME_ALIASES[player.name.toLowerCase()] ?? player.name;
      const matches = roster.filter((candidate) =>
        rosterNamesMatch(playerName, candidate.name)
      );
      if (matches.length !== 1) continue;
      const match = matches[0];
      await prisma.player.update({
        where: { id: player.id },
        data: {
          shirtNumber: match.shirtNumber,
          photoUrl: match.photoUrl ?? player.photoUrl,
        },
      });
      updated++;
    }
  }

  console.log(`Updated ${updated} players from ESPN rosters`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
