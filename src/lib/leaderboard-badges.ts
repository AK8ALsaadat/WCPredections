export type LeaderboardSpecialBadge = {
  label: string;
  title: string;
};

const SPECIAL_LEADERBOARD_BADGES = new Map<string, LeaderboardSpecialBadge>([
  [
    "nawafmd",
    {
      label: "معاذ بركه",
      title: "بادج خاص لـ nawafmd",
    },
  ],
  [
    "nawafmd5",
    {
      label: "معاذ بركه",
      title: "بادج خاص لـ nawafmd5",
    },
  ],
]);

function normalizeUsername(username: string) {
  return username.trim().toLocaleLowerCase("en-US");
}

export function getLeaderboardSpecialBadge(
  username: string
): LeaderboardSpecialBadge | null {
  return SPECIAL_LEADERBOARD_BADGES.get(normalizeUsername(username)) ?? null;
}
