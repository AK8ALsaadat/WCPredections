import { ar } from "@/lib/i18n/ar";
import { en } from "@/lib/i18n/en";
import type { Messages } from "@/lib/i18n/ar";

export type { Messages };
export type Locale = "ar" | "en";

export const defaultLocale: Locale = "ar";
export const LOCALE_COOKIE = "locale";

export function getMessages(locale: Locale): Messages {
  return locale === "en" ? en : ar;
}

export function isLocale(value: string | undefined | null): value is Locale {
  return value === "ar" || value === "en";
}

export function getDir(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}
