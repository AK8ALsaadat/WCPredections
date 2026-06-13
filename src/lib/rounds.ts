const DEFAULT_TOURNAMENT_ROUND_NAME = "بطولة الاستراحة - كأس العالم 26";

function repairMojibake(value: string): string {
  let repaired = value;
  for (let attempt = 0; attempt < 2 && /[ÃÂØÙ]/.test(repaired); attempt++) {
    repaired = Buffer.from(repaired, "latin1").toString("utf8");
  }
  return repaired.includes("\uFFFD") ? DEFAULT_TOURNAMENT_ROUND_NAME : repaired;
}

/** الجولة الرئيسية — كل مباريات بطولة الاستراحة */
export function getTournamentRoundName(): string {
  const configured = process.env.WORLD_CUP_ROUND_NAME?.trim();
  return configured
    ? repairMojibake(configured)
    : DEFAULT_TOURNAMENT_ROUND_NAME;
}

export function isTournamentRoundName(name: string): boolean {
  return name === getTournamentRoundName();
}

/** جولة فرعية داخل البطولة (مثل الجولة 1، دور المجموعات — 1) */
export function isSubRoundName(name: string): boolean {
  return !isTournamentRoundName(name);
}
