const BASELINE_POINTS_ENABLED = process.env.LEADERBOARD_BASELINE_POINTS !== "false";

export const INITIAL_LEADERBOARD_POINTS = new Map<string, number>([
  ["nawafmd", 155],
  ["bdr", 152],
  ["mohannad", 152],
  ["mohammed", 147],
  ["abood9af", 146],
  ["danger", 145],
  ["alsaadat", 143],
  ["alfaris14", 141],
  ["dawoad", 128],
  ["dawood", 128],
  ["abdullah", 127],
  ["nawaf", 100],
  ["mmg", 85],
  ["mhk", 67],
]);

export function deterministicYeloSeedPoints(username: string) {
  let hash = 0;
  for (const char of username.trim().toLowerCase()) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return 5 + (hash % 15);
}

export function getInitialLeaderboardPoints(username: string) {
  if (!BASELINE_POINTS_ENABLED) return 0;
  return INITIAL_LEADERBOARD_POINTS.get(username.trim().toLowerCase()) ?? 0;
}

export function applyOverallLeaderboardBaseline(username: string, points: number) {
  if (!BASELINE_POINTS_ENABLED) return points;

  const withInitialPoints = points + getInitialLeaderboardPoints(username);
  return withInitialPoints === 0
    ? deterministicYeloSeedPoints(username)
    : withInitialPoints;
}
