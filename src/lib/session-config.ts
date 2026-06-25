import type { SessionOptions } from "iron-session";
import type { UserSession } from "@/types";

export type SessionData = {
  user?: UserSession;
};

/** مدة بقاء المستخدم مسجّل (بالأيام) — افتراضي سنة */
const SESSION_DAYS = Number(process.env.SESSION_MAX_AGE_DAYS ?? "365");

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * SESSION_DAYS;

const sessionSecret = process.env.SESSION_SECRET;

export function assertSessionSecretConfigured() {
  const isProductionBuild =
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.npm_lifecycle_event === "build";
  if (!sessionSecret && process.env.NODE_ENV === "production" && !isProductionBuild) {
    throw new Error("SESSION_SECRET must be set in production");
  }
}

export const sessionOptions: SessionOptions = {
  password:
    sessionSecret ?? "complex_password_at_least_32_characters_long_dev_only",
  cookieName: "football_predictions_session",
  ttl: SESSION_TTL_SECONDS,
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  },
};
