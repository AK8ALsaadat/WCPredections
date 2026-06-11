import { PrismaClient } from "@prisma/client";
import { addDays, setHours, setMinutes } from "date-fns";

const prisma = new PrismaClient();

async function main() {
  const round = await prisma.round.upsert({
    where: { id: "seed-round-1" },
    create: {
      id: "seed-round-1",
      name: "الجولة 1",
      startsAt: new Date(),
      endsAt: addDays(new Date(), 30),
    },
    update: {},
  });

  const teams = await Promise.all(
    [
      { name: "Arsenal", short: "ARS" },
      { name: "Chelsea", short: "CHE" },
      { name: "Liverpool", short: "LIV" },
      { name: "Manchester City", short: "MCI" },
      { name: "Manchester United", short: "MUN" },
      { name: "Tottenham", short: "TOT" },
    ].map((t, i) =>
      prisma.team.upsert({
        where: { id: `seed-team-${i + 1}` },
        create: { id: `seed-team-${i + 1}`, name: t.name, shortName: t.short },
        update: {},
      })
    )
  );

  const fixtures = [
    [0, 1, 3],
    [2, 3, 4],
    [4, 5, 5],
    [0, 3, 6],
    [1, 2, 7],
    [5, 4, 8],
  ];

  for (const [home, away, dayOffset] of fixtures) {
    const matchTime = setMinutes(setHours(addDays(new Date(), dayOffset), 18), 0);
    const id = `seed-match-${home}-${away}-${dayOffset}`;

    await prisma.match.upsert({
      where: { id },
      create: {
        id,
        roundId: round.id,
        homeTeamId: teams[home].id,
        awayTeamId: teams[away].id,
        matchTime,
        status: "SCHEDULED",
      },
      update: { matchTime },
    });
  }

  console.log("Seed complete:", { round: round.name, teams: teams.length, matches: fixtures.length });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
