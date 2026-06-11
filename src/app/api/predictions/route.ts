import { apiSuccess, handleApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { parseBody, predictionSchema } from "@/lib/validations";
import { submitPrediction } from "@/services/prediction.service";

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const data = parseBody(predictionSchema, body);

    const prediction = await submitPrediction(user.userId, data);
    return apiSuccess(prediction, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
