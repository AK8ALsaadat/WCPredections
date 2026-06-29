import { apiSuccess, handleApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import {
  parseBody,
  fullPredictionBundleSchema,
  type FullPredictionBundleInput,
} from "@/lib/validations";
import { getMatchByIdForPredict } from "@/services/match.service";
import { submitMatchPredictionBundle } from "@/services/prediction.service";

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const fast = new URL(request.url).searchParams.get("fast") === "1";
    const body = await request.json();
    const data = parseBody(
      fullPredictionBundleSchema,
      body
    ) as FullPredictionBundleInput;

    const result = await submitMatchPredictionBundle(user.userId, data);
    if (fast) {
      return apiSuccess(result, 201);
    }

    const match = await getMatchByIdForPredict(data.matchId, user.userId);
    return apiSuccess({ ...result, match }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
