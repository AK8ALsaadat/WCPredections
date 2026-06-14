const TEAM_ALIASES: Record<string, string> = {
  turkiye: "turkey",
  "republic of korea": "south korea",
  "korea republic": "south korea",
  usa: "united states",
  "united states of america": "united states",
  "cote d ivoire": "ivory coast",
};

export function normalizeTeamIdentity(name: string): string {
  const normalized = name
    .replace(/[ıİ]/g, "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(?:national|football|soccer|team)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return TEAM_ALIASES[normalized] ?? normalized;
}

export function matchIdentityKey(homeName: string, awayName: string): string {
  const home = normalizeTeamIdentity(homeName) || homeName.toLowerCase().trim();
  const away = normalizeTeamIdentity(awayName) || awayName.toLowerCase().trim();
  return `${home}|${away}`;
}
