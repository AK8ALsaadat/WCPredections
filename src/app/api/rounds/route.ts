import { apiSuccess, handleApiError } from "@/lib/api";
import { getRounds } from "@/services/match.service";

export async function GET() {
  try {
    const rounds = await getRounds();
    return apiSuccess(rounds, 200, {
      headers: {
        "Cache-Control":
          "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
