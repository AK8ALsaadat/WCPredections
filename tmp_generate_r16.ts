import { PrismaClient } from '@prisma/client';

const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

interface TeamStanding {
  teamId: string;
  name: string;
  played: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

async function computeGroupStandings(roundId: string) {
  const prisma = new PrismaClient();
  
  try {
    const matches = await prisma.match.findMany({
      where: {
        roundId,
        groupCode: { not: null },
        status: 'FINISHED',
        homeScore: { not: null },
        awayScore: { not: null },
      },
      include: { homeTeam: true, awayTeam: true },
    });

    const standings: Record<string, TeamStanding[]> = {};
    for (const group of GROUPS) standings[group] = [];

    const teamMap = new Map<string, TeamStanding>();

    function getStanding(group: string, team: any) {
      const key = `${group}:${team.id}`;
      if (!teamMap.has(key)) {
        teamMap.set(key, {
          teamId: team.id,
          name: team.name,
          played: 0,
          points: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          goalDifference: 0,
        });
        standings[group].push(teamMap.get(key)!);
      }
      return teamMap.get(key)!;
    }

    for (const match of matches) {
      const group = match.groupCode?.replace('GROUP_', '') || '';
      if (!group) continue;

      const home = getStanding(group, match.homeTeam);
      const away = getStanding(group, match.awayTeam);
      const hs = match.homeScore!;
      const as = match.awayScore!;

      home.played++;
      away.played++;
      home.goalsFor += hs;
      home.goalsAgainst += as;
      away.goalsFor += as;
      away.goalsAgainst += hs;

      if (hs > as) home.points += 3;
      else if (hs < as) away.points += 3;
      else {
        home.points++;
        away.points++;
      }
    }

    for (const group of GROUPS) {
      for (const team of standings[group]) {
        team.goalDifference = team.goalsFor - team.goalsAgainst;
      }
      // Sort by points, goal difference, goals for
      standings[group].sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
        return b.goalsFor - a.goalsFor;
      });
    }

    return standings;
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const roundId = 'cmq993vyw0000cmts6llt4nvo'; // from database
  const standings = await computeGroupStandings(roundId);

  console.log('Group Standings:\n');
  for (const group of GROUPS) {
    console.log(`Group ${group}:`);
    for (let i = 0; i < standings[group].length; i++) {
      const t = standings[group][i];
      console.log(`  ${i + 1}. ${t.name} - ${t.points}pts, GD:${t.goalDifference}`);
    }
    console.log();
  }

  // Show potential Round of 16 matchups
  console.log('\nPotential Round of 16 matchups:');
  const pairings = [
    ['A', 'B'], ['C', 'D'], ['E', 'F'], ['G', 'H'],
    ['I', 'J'], ['K', 'L'],
  ];

  for (const [g1, g2] of pairings) {
    const w1 = standings[g1][0].name;
    const r2 = standings[g2][1].name;
    const w2 = standings[g2][0].name;
    const r1 = standings[g1][1].name;
    console.log(`Winner ${g1} (${w1}) vs Runner-up ${g2} (${r2})`);
    console.log(`Winner ${g2} (${w2}) vs Runner-up ${g1} (${r1})`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
