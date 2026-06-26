const TEAM_ALIASES: Record<string, string> = {
  turkiye: "turkey",
  "republic of korea": "south korea",
  "korea republic": "south korea",
  usa: "united states",
  "united states of america": "united states",
  "cote d ivoire": "ivory coast",
  "curaa ao": "curacao",
  "cabo verde": "cape verde",
  "cape verde islands": "cape verde",
  "dr congo": "congo dr",
  "d r congo": "congo dr",
  "democratic republic of congo": "congo dr",
  "democratic republic of the congo": "congo dr",
  "congo democratic republic": "congo dr",
  "ir iran": "iran",
  "bosnia and herzegovina": "bosnia herzegovina",
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
