import { apiSuccess, handleApiError } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import {
  calculateMatchPoints,
  calculateRoundPoints,
} from "@/services/prediction.service";
import { z } from "zod";

const schema = z.object({
  matchId: z.string().optional(),
  roundId: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = await request.json();
    const data = schema.parse(body);

    if (data.matchId) {
      await calculateMatchPoints(data.matchId);
      return apiSuccess({ message: "Points calculated for match", matchId: data.matchId });
    }

    if (data.roundId) {
      await calculateRoundPoints(data.roundId);
      return apiSuccess({ message: "Points calculated for round", roundId: data.roundId });
    }

    throw new Error("Either matchId or roundId is required");
  } catch (error) {
    return handleApiError(error);
  }
}
