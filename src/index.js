// src/index.js
const { dedupeAndFilterMatches } = require('./dedupe');

const sample = [
  { id: 1, home: 'Qatar', away: 'Bosnia', start_time: '2026-06-24T10:00:00Z', lineup: [] },
  { id: 1, home: 'Qatar', away: 'Bosnia', start_time: '2026-06-24T10:00:00Z', lineup: [{ name: 'Player A' }] },
  { id: 2, home: 'Team A', away: 'Team B', start_time: '2026-06-24T12:00:00Z', homeLineup: [{ name: 'P1' }] }
];

console.log('raw count:', sample.length);
const visible = dedupeAndFilterMatches(sample);
console.log('visible count:', visible.length);
console.log(JSON.stringify(visible, null, 2));
