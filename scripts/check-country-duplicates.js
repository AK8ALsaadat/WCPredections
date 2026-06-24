// scripts/check-country-duplicates.js
// Fetch all matches and report duplicates for a target country/team name
const COUNTRY_REGEX = process.env.COUNTRY_REGEX || 'qatar|قطر';
(async () => {
  try {
    const res = await fetch('http://localhost:3000/api/matches?schedule=true');
    const data = await res.json();
    const matches = Array.isArray(data.data) ? data.data : data;
    const re = new RegExp(COUNTRY_REGEX, 'i');
    const filtered = matches.filter(
      (m) => re.test(m.homeTeam?.name || '') || re.test(m.awayTeam?.name || '')
    );
    console.log('Total matches (API):', matches.length);
    console.log(`Matches matching /${COUNTRY_REGEX}/i:`, filtered.length);
    const map = new Map();
    for (const m of filtered) {
      const key = `${m.homeTeam?.name}||${m.awayTeam?.name}||${m.matchTime}`;
      map.set(key, (map.get(key) || 0) + 1);
    }
    const dups = [...map.entries()].filter(([, v]) => v > 1);
    if (dups.length === 0) {
      console.log('No duplicates found for the country.');
    } else {
      console.log('Duplicates:');
      for (const [k, v] of dups) console.log(`  ${k} => ${v}`);
    }
  } catch (err) {
    console.error('Error checking country duplicates:', err.message || err);
    process.exit(2);
  }
})();
