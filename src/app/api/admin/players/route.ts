import { apiSuccess, handleApiError } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { parseBody, playerSchema } from "@/lib/validations";
import { createPlayer } from "@/services/match.service";

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = await request.json();
    const data = parseBody(playerSchema, body);

    const player = await createPlayer(data);
    return apiSuccess(player, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
