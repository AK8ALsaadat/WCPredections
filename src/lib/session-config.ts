import type { SessionOptions } from "iron-session";
import type { UserSession } from "@/types";

export type SessionData = {
  user?: UserSession;
};

/** مدة بقاء المستخدم مسجّل (بالأيام) — افتراضي سنة */
const SESSION_DAYS = Number(process.env.SESSION_MAX_AGE_DAYS ?? "365");

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * SESSION_DAYS;

export const sessionOptions: SessionOptions = {
  password:
    process.env.SESSION_SECRET ??
    "complex_password_at_least_32_characters_long",
  cookieName: "football_predictions_session",
  ttl: SESSION_TTL_SECONDS,
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  },
};
