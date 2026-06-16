type DisplayTeam = {
  name: string;
  shortName: string;
  logoUrl?: string | null;
};

const SAUDI_NAMES = [
  "السعودية",
  "المملكة العربية السعودية",
  "saudi arabia",
  "saudi",
  "ط§ظ„ط³ط¹ظˆط¯ظٹط©",
];

function isSaudiTeam(team: DisplayTeam) {
  const values = [team.name, team.shortName].map((value) =>
    value.toLowerCase()
  );
  return SAUDI_NAMES.some((saudiName) =>
    values.some((value) => value.includes(saudiName.toLowerCase()))
  );
}

export function getSaudiLossDisplayTeam<T extends DisplayTeam>(
  team: T,
  homeScore: number | null | undefined,
  awayScore: number | null | undefined,
  isHome: boolean
): T {
  const hasResult = homeScore != null && awayScore != null;
  const lost =
    hasResult &&
    ((isHome && homeScore < awayScore) || (!isHome && awayScore < homeScore));

  if (!lost || !isSaudiTeam(team)) return team;

  return {
    ...team,
    name: "الكويت",
    shortName: "الكويت",
    logoUrl: null,
  };
}
