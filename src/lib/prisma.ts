import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function addConnectionLimitToUrl(url: string, limit: string) {
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("connection_limit")) {
      parsed.searchParams.set("connection_limit", limit);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

const connectionLimit =
  process.env.NODE_ENV === "production"
    ? process.env.PRISMA_CONNECTION_LIMIT ?? "1"
    : process.env.PRISMA_CONNECTION_LIMIT;

const prismaUrl = process.env.DATABASE_URL
  ? connectionLimit
    ? addConnectionLimitToUrl(process.env.DATABASE_URL, connectionLimit)
    : process.env.DATABASE_URL
  : undefined;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(prismaUrl ? { datasources: { db: { url: prismaUrl } } } : {}),
  });

globalForPrisma.prisma = prisma;
