import { prisma } from "@/lib/prisma";
import { apiSuccess, apiError } from "@/lib/api";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return apiSuccess({
      database: "connected",
      footballApi: process.env.FOOTBALL_API_PROVIDER ?? "api-football",
      autoSync: process.env.ENABLE_AUTO_SYNC !== "false",
    });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Database connection failed",
      503
    );
  }
}
