const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function preferFetch() {
  if (typeof fetch === 'function') return fetch.bind(globalThis);
  return null;
}

async function tryRevalidate(base, secret) {
  if (!secret) {
    console.log('CRON_SECRET not set — skipped leaderboard revalidate.');
    return;
  }
  const fetchFn = preferFetch() || (await import('node-fetch').then((m) => m.default || m).catch(() => null));
  if (!fetchFn) {
    console.log('Fetch not available — cannot revalidate leaderboard.');
    return;
  }
  try {
    const res = await fetchFn(`${base}/api/cron/revalidate-leaderboard`, { method: 'POST', headers: { Authorization: `Bearer ${secret}` } });
    console.log('Revalidate leaderboard status:', res.status);
  } catch (err) {
    console.warn('Revalidate failed:', err.message || err);
  }
}

async function main() {
  // find Portugal team(s)
  const teams = await prisma.team.findMany({
    where: {
      OR: [
        { name: { contains: 'portugal', mode: 'insensitive' } },
        { shortName: { contains: 'por', mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, shortName: true },
  });

  if (!teams || teams.length === 0) {
    console.log('No team matching "Portugal" found. Aborting.');
    return;
  }

  const teamIds = teams.map((t) => t.id);
  console.log('Found teams:', teams.map((t) => `${t.name}(${t.shortName})`).join(', '));

  // find matches involving these teams
  const matches = await prisma.match.findMany({ where: { OR: [{ homeTeamId: { in: teamIds } }, { awayTeamId: { in: teamIds } }] }, select: { id: true, homeTeamId: true, awayTeamId: true, matchTime: true } });
  if (!matches || matches.length === 0) {
    console.log('No matches found for Portugal teams. Nothing to delete.');
    return;
  }
  const matchIds = matches.map((m) => m.id);
  console.log(`Found ${matches.length} match(es) involving Portugal.`);

  // find QA users (username startsWith qa_ or ui_qa_) who predicted these matches
  const qaUsers = await prisma.user.findMany({
    where: {
      AND: [
        {
          OR: [{ username: { startsWith: 'qa_' } }, { username: { startsWith: 'ui_qa_' } }],
        },
        {
          predictions: { some: { matchId: { in: matchIds } } },
        },
      ],
    },
    select: { id: true, username: true },
  });

  if (!qaUsers || qaUsers.length === 0) {
    console.log('No QA users with predictions on Portugal matches found.');
    return;
  }

  console.log('QA users to remove:');
  qaUsers.forEach((u) => console.log(' -', u.username));

  const ids = qaUsers.map((u) => u.id);

  // delete users (cascades will remove related predictions/bets)
  const deleted = await prisma.user.deleteMany({ where: { id: { in: ids } } });
  console.log(`Deleted ${deleted.count} user(s).`);

  // Revalidate leaderboard cache if possible
  const base = process.env.BASE_URL || 'https://wc-predections.vercel.app';
  const secret = process.env.CRON_SECRET;
  await tryRevalidate(base, secret);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
