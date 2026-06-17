import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { UserSession } from "@/types";

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

function getAdminUsernames(): string[] {
  return (process.env.ADMIN_USERNAMES ?? "")
    .split(",")
    .map((u) => u.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminUsername(username: string): boolean {
  return getAdminUsernames().includes(username.toLowerCase());
}

export async function createUser(
  username: string,
  password: string
): Promise<UserSession> {
  const existing = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
  });

  if (existing) {
    throw new Error("Username already taken");
  }

  const passwordHash = await hashPassword(password);
  const isAdmin = isAdminUsername(username);

  const user = await prisma.user.create({
    data: {
      username: username.toLowerCase(),
      passwordHash,
      isAdmin,
    },
    select: {
      id: true,
      username: true,
      isAdmin: true,
      hasSeenTutorial: true,
      hasSeenKnockoutTutorial: true,
    },
  });

  return {
    userId: user.id,
    username: user.username,
    isAdmin: user.isAdmin,
    hasSeenTutorial: user.hasSeenTutorial,
    hasSeenKnockoutTutorial: user.hasSeenKnockoutTutorial,
  };
}

export async function updateUserUsername(
  userId: string,
  newUsername: string
): Promise<UserSession> {
  const normalized = newUsername.toLowerCase();

  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      isAdmin: true,
      hasSeenTutorial: true,
      hasSeenKnockoutTutorial: true,
    },
  });

  if (!current) {
    throw new Error("المستخدم غير موجود");
  }

  if (current.username === normalized) {
    return {
      userId: current.id,
      username: current.username,
      isAdmin: current.isAdmin,
      hasSeenTutorial: current.hasSeenTutorial,
      hasSeenKnockoutTutorial: current.hasSeenKnockoutTutorial,
    };
  }

  const taken = await prisma.user.findUnique({
    where: { username: normalized },
    select: { id: true },
  });

  if (taken) {
    throw new Error("اسم المستخدم مأخوذ — جرّب اسم ثاني");
  }

  const isAdmin = isAdminUsername(normalized);

  const user = await prisma.user.update({
    where: { id: userId },
    data: { username: normalized, isAdmin },
    select: {
      id: true,
      username: true,
      isAdmin: true,
      hasSeenTutorial: true,
      hasSeenKnockoutTutorial: true,
    },
  });

  return {
    userId: user.id,
    username: user.username,
    isAdmin: user.isAdmin,
    hasSeenTutorial: user.hasSeenTutorial,
    hasSeenKnockoutTutorial: user.hasSeenKnockoutTutorial,
  };
}

export async function authenticateUser(
  username: string,
  password: string
): Promise<UserSession | null> {
  const user = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
    select: {
      id: true,
      username: true,
      passwordHash: true,
      isAdmin: true,
      hasSeenTutorial: true,
      hasSeenKnockoutTutorial: true,
    },
  });

  if (!user) return null;

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return null;

  return {
    userId: user.id,
    username: user.username,
    isAdmin: user.isAdmin,
    hasSeenTutorial: user.hasSeenTutorial,
    hasSeenKnockoutTutorial: user.hasSeenKnockoutTutorial,
  };
}

export async function claimBoldFiveNotice(userId: string): Promise<boolean> {
  const result = await prisma.user.updateMany({
    where: {
      id: userId,
      hasSeenBoldFiveNotice: false,
    },
    data: {
      hasSeenBoldFiveNotice: true,
    },
  });

  return result.count === 1;
}
