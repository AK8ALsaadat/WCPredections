import { apiSuccess, handleApiError } from "@/lib/api";
import { getRounds } from "@/services/match.service";

export async function GET() {
  try {
    const rounds = await getRounds();
    return apiSuccess(rounds);
  } catch (error) {
    return handleApiError(error);
  }
}
