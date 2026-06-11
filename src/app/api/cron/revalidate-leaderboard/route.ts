import { revalidateTag } from "next/cache";
import { apiSuccess, apiError, handleApiError } from "@/lib/api";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return apiError("Unauthorized", 401);
    }

    revalidateTag("leaderboard-overall");
    return apiSuccess({ revalidated: true });
  } catch (error) {
    return handleApiError(error);
  }
}
