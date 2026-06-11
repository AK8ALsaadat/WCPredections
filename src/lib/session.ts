import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import type { UserSession } from "@/types";
import { sessionOptions, type SessionData } from "@/lib/session-config";

export type { SessionData };

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

export async function getCurrentUser(): Promise<UserSession | null> {
  const session = await getSession();
  return session.user ?? null;
}

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
