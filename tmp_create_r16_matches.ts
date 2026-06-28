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

async function main() {
  const prisma = new PrismaClient();
  
  try {
    const roundId = 'cmq993vyw0000cmts6llt4nvo';
    
    // Compute group standings
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
      standings[group].sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
        return b.goalsFor - a.goalsFor;
      });
    }

    // Define R16 pairings
    const r16Pairings = [
      { home: { group: 'A', pos: 0 }, away: { group: 'B', pos: 1 }, matchTime: new Date('2026-07-01T16:00:00Z') },
      { home: { group: 'B', pos: 0 }, away: { group: 'A', pos: 1 }, matchTime: new Date('2026-07-01T20:00:00Z') },
      { home: { group: 'C', pos: 0 }, away: { group: 'D', pos: 1 }, matchTime: new Date('2026-07-02T16:00:00Z') },
      { home: { group: 'D', pos: 0 }, away: { group: 'C', pos: 1 }, matchTime: new Date('2026-07-02T20:00:00Z') },
      { home: { group: 'E', pos: 0 }, away: { group: 'F', pos: 1 }, matchTime: new Date('2026-07-03T16:00:00Z') },
      { home: { group: 'F', pos: 0 }, away: { group: 'E', pos: 1 }, matchTime: new Date('2026-07-03T20:00:00Z') },
      { home: { group: 'G', pos: 0 }, away: { group: 'H', pos: 1 }, matchTime: new Date('2026-07-04T16:00:00Z') },
      { home: { group: 'H', pos: 0 }, away: { group: 'G', pos: 1 }, matchTime: new Date('2026-07-04T20:00:00Z') },
      { home: { group: 'I', pos: 0 }, away: { group: 'J', pos: 1 }, matchTime: new Date('2026-07-05T16:00:00Z') },
      { home: { group: 'J', pos: 0 }, away: { group: 'I', pos: 1 }, matchTime: new Date('2026-07-05T20:00:00Z') },
      { home: { group: 'K', pos: 0 }, away: { group: 'L', pos: 1 }, matchTime: new Date('2026-07-06T16:00:00Z') },
      { home: { group: 'L', pos: 0 }, away: { group: 'K', pos: 1 }, matchTime: new Date('2026-07-06T20:00:00Z') },
    ];

    console.log('Creating Round of 16 matches...\n');
    let created = 0;

    for (const pairing of r16Pairings) {
      const homeTeam = standings[pairing.home.group][pairing.home.pos];
      const awayTeam = standings[pairing.away.group][pairing.away.pos];

      if (!homeTeam || !awayTeam) {
        console.log(`⚠️  Skipping: Unable to find teams for ${pairing.home.group}#${pairing.home.pos} vs ${pairing.away.group}#${pairing.away.pos}`);
        continue;
      }

      // Check if match already exists
      const existing = await prisma.match.findFirst({
        where: {
          roundId,
          homeTeamId: homeTeam.teamId,
          awayTeamId: awayTeam.teamId,
          isKnockout: true,
        },
      });

      if (existing) {
        console.log(`✓ Already exists: ${homeTeam.name} vs ${awayTeam.name}`);
        continue;
      }

      const newMatch = await prisma.match.create({
        data: {
          roundId,
          homeTeamId: homeTeam.teamId,
          awayTeamId: awayTeam.teamId,
          matchTime: pairing.matchTime,
          status: 'SCHEDULED',
          isKnockout: true,
          stageName: 'Round of 16',
        },
      });

      console.log(`✓ Created: ${homeTeam.name} vs ${awayTeam.name} @ ${pairing.matchTime.toISOString()}`);
      created++;
    }

    console.log(`\n✅ Total Round of 16 matches created: ${created}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
