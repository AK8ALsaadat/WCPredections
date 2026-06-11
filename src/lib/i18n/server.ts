import { cookies } from "next/headers";
import {
  defaultLocale,
  getDir,
  getMessages,
  isLocale,
  type Locale,
} from "@/lib/i18n/index";

export { getDir };

export async function getServerLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const value = cookieStore.get("locale")?.value;
  return isLocale(value) ? value : defaultLocale;
}

export async function getServerI18n() {
  const locale = await getServerLocale();
  return {
    locale,
    dir: getDir(locale),
    messages: getMessages(locale),
  };
}
