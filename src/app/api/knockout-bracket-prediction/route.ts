import { apiSuccess, handleApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { knockoutBracketPredictionSchema, parseBody } from "@/lib/validations";
import {
  getKnockoutBracketPredictionStatus,
  submitKnockoutBracketPrediction,
} from "@/services/knockout-bracket-prediction.service";

export async function GET() {
  try {
    const user = await requireAuth();
    const status = await getKnockoutBracketPredictionStatus(user.userId);
    return apiSuccess(status, 200, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const data = parseBody(knockoutBracketPredictionSchema, body);
    const prediction = await submitKnockoutBracketPrediction(user.userId, data);
    return apiSuccess(prediction, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
