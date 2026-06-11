/** الجولة الرئيسية — كل مباريات بطولة الاستراحة */
export function getTournamentRoundName(): string {
  return process.env.WORLD_CUP_ROUND_NAME ?? "بطولة الاستراحة - كأس العالم 26";
}

export function isTournamentRoundName(name: string): boolean {
  return name === getTournamentRoundName();
}

/** جولة فرعية داخل البطولة (مثل الجولة 1، دور المجموعات — 1) */
export function isSubRoundName(name: string): boolean {
  return !isTournamentRoundName(name);
}
