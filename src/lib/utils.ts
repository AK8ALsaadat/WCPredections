import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { ar } from "@/lib/i18n/ar";
import type { Messages } from "@/lib/i18n/ar";
import type { Locale } from "@/lib/i18n/index";

function dateLocale(locale?: Locale): string {
  return locale === "en" ? "en-US" : "ar-SA";
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** يحوّل حقل نصي لنتيجة؛ يقبل 0 كقيمة صالحة */
export function parseOptionalScore(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? null : n;
}

export function formatDate(date: Date | string, locale?: Locale): string {
  return new Intl.DateTimeFormat(dateLocale(locale), {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export function formatDateShort(date: Date | string, locale?: Locale): string {
  return new Intl.DateTimeFormat(dateLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

export function formatDayHeader(date: Date | string, locale?: Locale): string {
  return new Intl.DateTimeFormat(dateLocale(locale), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(date));
}

const PREDICTION_TIMEZONE =
  process.env.SYNC_TIMEZONE ?? process.env.PREDICTION_TIMEZONE ?? "Asia/Riyadh";

export const PREDICTION_WINDOW_HOURS = 48;

export function getPredictionTimezone(): string {
  return PREDICTION_TIMEZONE;
}

/** يوم المباراة بتوقيت نافذة التوقع (الرياض) — للتجميع في الجدول */
export function getMatchCalendarDay(
  matchTime: Date | string,
  timeZone = PREDICTION_TIMEZONE
): string {
  return getCalendarDayInTz(new Date(matchTime), timeZone);
}

export function isMatchStarted(matchTime: Date | string): boolean {
  return new Date(matchTime) <= new Date();
}

function getCalendarDayInTz(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

function getTomorrowCalendarDay(timeZone: string, from = new Date()): string {
  const today = getCalendarDayInTz(from, timeZone);
  const [year, month, day] = today.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
}

/** آخر يوم مسموح للتوقع (اليوم + بكره) بتوقيت الرياض */
export function getPredictionWindowEndDate(): Date {
  const tomorrow = getTomorrowCalendarDay(PREDICTION_TIMEZONE);
  return new Date(`${tomorrow}T23:59:59.999`);
}

function hoursUntilMatch(matchTime: Date): number {
  return (matchTime.getTime() - Date.now()) / (1000 * 60 * 60);
}

function isWithinPredictionCalendarWindow(matchTime: Date): boolean {
  const today = getCalendarDayInTz(new Date(), PREDICTION_TIMEZONE);
  const tomorrow = getTomorrowCalendarDay(PREDICTION_TIMEZONE);
  const matchDay = getCalendarDayInTz(matchTime, PREDICTION_TIMEZONE);
  return matchDay === today || matchDay === tomorrow;
}

function isMatchStatusLocked(status?: string | null): boolean {
  return status === "LIVE" || status === "FINISHED" || status === "CANCELLED";
}

/** التوقع مسموح لمباريات اليوم وبكره فقط — خلال 48 ساعة وقبل بداية المباراة */
export function isPredictionAllowed(
  matchTime: Date | string,
  status?: string | null
): boolean {
  if (isMatchStatusLocked(status)) return false;

  const match = new Date(matchTime);
  if (isMatchStarted(matchTime)) return false;

  const hoursLeft = hoursUntilMatch(match);
  if (hoursLeft > PREDICTION_WINDOW_HOURS) return false;

  return isWithinPredictionCalendarWindow(match);
}

export function getPredictionLockReason(
  matchTime: Date | string,
  status?: string | null,
  messages: Messages = ar
): string | null {
  const t = messages.lockReasons;

  if (status === "LIVE") return t.live;
  if (status === "FINISHED") return t.finished;
  if (status === "CANCELLED") return t.cancelled;
  if (isMatchStarted(matchTime)) return t.started;

  const match = new Date(matchTime);
  const hoursLeft = hoursUntilMatch(match);

  if (hoursLeft > PREDICTION_WINDOW_HOURS) return t.tooEarly;
  if (!isWithinPredictionCalendarWindow(match)) return t.windowOnly;

  return null;
}

function getZonedMidnight(calendarDay: string, timeZone: string): Date {
  if (timeZone === "Asia/Riyadh") {
    return new Date(`${calendarDay}T00:00:00+03:00`);
  }

  return new Date(`${calendarDay}T00:00:00Z`);
}

/** آخر موعد لإرسال التوقع = انطلاق المباراة */
export function getPredictionDeadline(matchTime: Date | string): Date | null {
  if (isMatchStarted(matchTime) || !isPredictionAllowed(matchTime)) {
    return null;
  }

  return new Date(matchTime);
}

/** أول لحظة يفتح فيها التوقع لهذه المباراة */
export function getPredictionOpensAt(matchTime: Date | string): Date | null {
  if (isMatchStarted(matchTime) || isPredictionAllowed(matchTime)) {
    return null;
  }

  const match = new Date(matchTime);
  const matchDay = getCalendarDayInTz(match, PREDICTION_TIMEZONE);
  const [year, month, day] = matchDay.split("-").map(Number);
  const dayBeforeMatch = new Date(Date.UTC(year, month - 1, day - 1))
    .toISOString()
    .slice(0, 10);

  const fortyEightHoursBefore = new Date(
    match.getTime() - PREDICTION_WINDOW_HOURS * 60 * 60 * 1000
  );
  const calendarWindowStart = getZonedMidnight(
    dayBeforeMatch,
    PREDICTION_TIMEZONE
  );

  const opensAt = new Date(
    Math.max(
      fortyEightHoursBefore.getTime(),
      calendarWindowStart.getTime()
    )
  );

  if (opensAt >= match || opensAt <= new Date()) {
    return null;
  }

  return opensAt;
}

export type PredictionCountdownTarget = {
  kind: "closes" | "opens";
  at: Date;
};

export function getPredictionCountdownTarget(
  matchTime: Date | string
): PredictionCountdownTarget | null {
  const deadline = getPredictionDeadline(matchTime);
  if (deadline) {
    return { kind: "closes", at: deadline };
  }

  const opensAt = getPredictionOpensAt(matchTime);
  if (opensAt) {
    return { kind: "opens", at: opensAt };
  }

  return null;
}

export function formatCountdownParts(remainingMs: number) {
  const safeMs = Math.max(0, remainingMs);
  const totalSeconds = Math.floor(safeMs / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  return { days, hours, minutes, seconds };
}

export function formatCountdown(remainingMs: number, locale?: Locale): string {
  const { days, hours, minutes, seconds } = formatCountdownParts(remainingMs);
  const numLocale = locale === "en" ? "en-US" : "ar-SA";
  const n = (value: number) => value.toLocaleString(numLocale);
  const parts: string[] = [];

  if (locale === "en") {
    if (days > 0) parts.push(`${n(days)}d`);
    if (hours > 0 || days > 0) parts.push(`${n(hours)}h`);
    parts.push(`${n(minutes)}m`);
    parts.push(`${n(seconds)}s`);
    return parts.join(" ");
  }

  if (days > 0) parts.push(`${n(days)} ي`);
  if (hours > 0 || days > 0) parts.push(`${n(hours)} س`);
  parts.push(`${n(minutes)} د`);
  parts.push(`${n(seconds)} ث`);

  return parts.join(" ");
}

/** @deprecated Use formatCountdown instead */
export function formatCountdownAr(remainingMs: number): string {
  return formatCountdown(remainingMs);
}

export function getMatchResult(
  homeScore: number,
  awayScore: number
): "home" | "away" | "draw" {
  if (homeScore > awayScore) return "home";
  if (homeScore < awayScore) return "away";
  return "draw";
}

export function groupByDate<T extends { matchTime: Date | string }>(
  items: T[]
): Record<string, T[]> {
  const groups: Record<string, T[]> = {};

  for (const item of items) {
    const d = new Date(item.matchTime);
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString();
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }

  return groups;
}
