import { apiSuccess, apiError, handleApiError } from "@/lib/api";
import { syncActiveRoundFromApi } from "@/services/sync.service";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return apiError("Unauthorized", 401);
    }

    const result = await syncActiveRoundFromApi();
    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  return GET(request);
}
