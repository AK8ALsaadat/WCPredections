(async ()=>{
  try {
    const res = await fetch('http://localhost:3002/api/matches');
    const data = await res.json();
    const match = data.data.find(m => m.status !== 'FINISHED');
    if (!match) {
      console.error('NO_UPCOMING_MATCH');
      process.exit(0);
    }
    console.log('MATCH_ID', match.id, 'MATCH_TIME', match.matchTime);
    const r = await fetch('http://localhost:3002/api/matches/' + match.id + '/lineup');
    const j = await r.json();
    console.log(JSON.stringify(j, null, 2));
  } catch (e) {
    console.error('ERROR', e);
    process.exit(1);
  }
})();
