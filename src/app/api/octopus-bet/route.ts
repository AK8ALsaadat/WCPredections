import { apiSuccess, handleApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { parseBody, octopusGoalkeeperBetSchema } from "@/lib/validations";
import {
  getOctopusBetStatus,
  submitOctopusBet,
} from "@/services/octopus-bet.service";

export async function GET(request: Request) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(request.url);
    const matchId = searchParams.get("matchId");

    if (!matchId) {
      throw new Error("matchId is required");
    }

    const status = await getOctopusBetStatus(user.userId, matchId);
    return apiSuccess(status);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const data = parseBody(octopusGoalkeeperBetSchema, body);

    const bet = await submitOctopusBet(user.userId, data.matchId, data.playerId);
    return apiSuccess(bet, bet ? 201 : 200);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const data = parseBody(octopusGoalkeeperBetSchema, body);

    const bet = await submitOctopusBet(user.userId, data.matchId, null);
    return apiSuccess(bet, 200);
  } catch (error) {
    return handleApiError(error);
  }
}
