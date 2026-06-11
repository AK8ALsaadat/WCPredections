import { apiSuccess, apiError, handleApiError } from "@/lib/api";

export const dynamic = "force-dynamic";
import { getCurrentUser } from "@/lib/session";
import {
  getMatchById,
  getMatchByIdForPredict,
} from "@/services/match.service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const forPredict = searchParams.get("predict") === "true";
    const includeLineup = searchParams.get("lineup") === "true";
    const user = await getCurrentUser();

    const match = forPredict
      ? await getMatchByIdForPredict(id, user?.userId)
      : await getMatchById(id, user?.userId, { includeLineup });

    if (!match) {
      return apiError("Match not found", 404);
    }

    if (forPredict) {
      return apiSuccess(match, 200, {
        headers: {
          "Cache-Control": "private, no-cache",
        },
      });
    }

    return apiSuccess(match, 200, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
