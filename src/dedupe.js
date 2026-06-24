// src/dedupe.js
// Utility to deduplicate matches and hide matches without any lineup

function hasLineup(m) {
  return (
    (Array.isArray(m.lineup) && m.lineup.length > 0) ||
    (Array.isArray(m.homeLineup) && m.homeLineup.length > 0) ||
    (Array.isArray(m.awayLineup) && m.awayLineup.length > 0)
  );
}

function keyOf(m) {
  if (m.id !== undefined && m.id !== null) return String(m.id);
  const home = m.home ?? m.home_team ?? m.homeName ?? '';
  const away = m.away ?? m.away_team ?? m.awayName ?? '';
  const time = m.start_time ?? m.kickoff ?? m.start ?? '';
  return `${home}::${away}::${time}`;
}

function dedupeAndFilterMatches(matches) {
  if (!Array.isArray(matches)) return [];
  const map = new Map();
  for (const m of matches) {
    const key = keyOf(m);
    const existing = map.get(key);
    const mHas = hasLineup(m);

    if (!existing) {
      map.set(key, m);
      continue;
    }

    const existingHas = hasLineup(existing);

    // Prefer the entry that has a lineup
    if (!existingHas && mHas) {
      map.set(key, m);
      continue;
    }

    // If both have lineups, prefer the one with later updated timestamp
    const existingUpdated = Number(existing.updatedAt ?? existing.updated_at ?? 0) || 0;
    const mUpdated = Number(m.updatedAt ?? m.updated_at ?? 0) || 0;
    if (existingHas && mHas && mUpdated > existingUpdated) {
      map.set(key, m);
    }
    // otherwise keep existing
  }

  return Array.from(map.values()).filter(hasLineup);
}

module.exports = { dedupeAndFilterMatches, hasLineup, keyOf };
