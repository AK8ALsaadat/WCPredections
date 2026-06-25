import { cache } from "react";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import type { UserSession } from "@/types";
import {
  assertSessionSecretConfigured,
  sessionOptions,
  type SessionData,
} from "@/lib/session-config";

export type { SessionData };

export const getSession = cache(async () => {
  assertSessionSecretConfigured();
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
});

export const getCurrentUser = cache(async (): Promise<UserSession | null> => {
  const session = await getSession();
  return session.user ?? null;
});

export async function requireAuth(): Promise<UserSession> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}

export async function requireAdmin(): Promise<UserSession> {
  const user = await requireAuth();
  if (!user.isAdmin) {
    throw new Error("Forbidden");
  }
  return user;
}
