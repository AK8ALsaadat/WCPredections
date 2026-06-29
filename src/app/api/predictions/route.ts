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
    const body = await request.json();
    const data = parseBody(
      fullPredictionBundleSchema,
      body
    ) as FullPredictionBundleInput;

    const result = await submitMatchPredictionBundle(user.userId, data);
    const match = await getMatchByIdForPredict(data.matchId, user.userId);
    return apiSuccess({ ...result, match }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
