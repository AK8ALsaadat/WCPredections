import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const match = await prisma.match.findFirst({
    where: {
      homeTeam: { name: { contains: "Saudi" } },
    },
    select: {
      id: true,
      homeTeam: { select: { name: true, apiTeamId: true } },
      awayTeam: { select: { name: true, apiTeamId: true } },
    },
  });

  if (!match) {
    console.log("no saudi match");
    return;
  }

  const { getMatchLineup } = await import("../src/services/match.service");
  const lineup = await getMatchLineup(match.id);

  console.log("key:", !!process.env.FOOTBALL_DATA_API_KEY);
  console.log("lineup flag:", process.env.LINEUP_USE_FOOTBALL_DATA);
  console.log(
    match.homeTeam.name,
    lineup?.homeLineupSource,
    lineup?.homeFormation,
    lineup?.homePlayers.filter((p) => p.section === "lineup").length
  );
  console.log(
    match.awayTeam.name,
    lineup?.awayLineupSource,
    lineup?.awayFormation,
    lineup?.awayPlayers.filter((p) => p.section === "lineup").length
  );
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
