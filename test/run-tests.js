// test/run-tests.js
const assert = require('assert');
const { dedupeAndFilterMatches } = require('../src/dedupe');

function run() {
  // Test 1: prefer entry with lineup when duplicate id
  const t1 = [
    { id: 1, home: 'Qatar', away: 'Bosnia', start_time: '2026-06-24T10:00:00Z', lineup: [] },
    { id: 1, home: 'Qatar', away: 'Bosnia', start_time: '2026-06-24T10:00:00Z', lineup: [{ player: 'A' }] },
    { id: 2, home: 'X', away: 'Y', homeLineup: [{ player: 'B' }] }
  ];
  const r1 = dedupeAndFilterMatches(t1);
  assert.strictEqual(r1.length, 2, 't1 length should be 2');
  assert.ok(r1.some(m => String(m.id) === '1' && m.lineup && m.lineup.length > 0), 'id 1 should have lineup');

  // Test 2: duplicate by composite key without id
  const t2 = [
    { home: 'Qatar', away: 'Bosnia', start_time: '2026-06-24T10:00:00Z', lineup: [] },
    { home: 'Qatar', away: 'Bosnia', start_time: '2026-06-24T10:00:00Z', homeLineup: [{ name: 'X' }] }
  ];
  const r2 = dedupeAndFilterMatches(t2);
  assert.strictEqual(r2.length, 1, 't2 length should be 1');
  assert.ok(r2[0].homeLineup && r2[0].homeLineup.length > 0, 'should keep the item with homeLineup');

  // Test 3: remove empty lineup entries
  const t3 = [ { id: 3, home: 'A', away: 'B', lineup: [] } ];
  const r3 = dedupeAndFilterMatches(t3);
  assert.strictEqual(r3.length, 0, 't3 should be empty after filtering');

  // Test 4: prefer later updated entry when both have lineup
  const t4 = [
    { id: 4, home: 'X', away: 'Y', lineup: [{ p: 1 }], updated_at: 1650000 },
    { id: 4, home: 'X', away: 'Y', lineup: [{ p: 2 }], updated_at: 1651000 }
  ];
  const r4 = dedupeAndFilterMatches(t4);
  assert.strictEqual(r4.length, 1, 't4 length should be 1');
  assert.strictEqual(r4[0].updated_at, 1651000, 'should keep the later updated entry');

  console.log('All tests passed');
}

try {
  run();
  process.exit(0);
} catch (err) {
  console.error('Tests failed: ', err && err.message);
  console.error(err && err.stack);
  process.exit(2);
}
