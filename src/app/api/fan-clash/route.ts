import { z } from "zod";
import { apiError, apiSuccess, handleApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import {
  activateFanClashPowerup,
  getFanClashState,
  listFanClashMatches,
  saveFanClashPicks,
} from "@/services/fan-clash.service";

export const dynamic = "force-dynamic";

const saveSchema = z.object({
  matchId: z.string().min(1),
  playerIds: z.array(z.string().min(1)).min(1).max(4),
});

const powerupSchema = z.object({
  matchId: z.string().min(1),
  playerId: z.string().min(1),
});

export async function GET(request: Request) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(request.url);
    const matchId = searchParams.get("matchId");

    if (!matchId) {
      const matches = await listFanClashMatches();
      return apiSuccess(matches, 200, {
        headers: { "Cache-Control": "private, max-age=20" },
      });
    }

    const state = await getFanClashState(matchId, user.userId);
    return apiSuccess(state, 200, {
      headers: { "Cache-Control": "private, no-cache" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const action = String(body.action ?? "save-picks");

    if (action === "save-picks") {
      const parsed = saveSchema.safeParse(body);
      if (!parsed.success) return apiError("Invalid Fan Clash picks", 400);
      await saveFanClashPicks(
        parsed.data.matchId,
        user.userId,
        parsed.data.playerIds
      );
      return apiSuccess({ saved: true });
    }

    if (action === "powerup") {
      const parsed = powerupSchema.safeParse(body);
      if (!parsed.success) return apiError("Invalid powerup request", 400);
      await activateFanClashPowerup(
        parsed.data.matchId,
        user.userId,
        parsed.data.playerId
      );
      return apiSuccess({ activated: true });
    }

    return apiError("Unknown Fan Clash action", 400);
  } catch (error) {
    return handleApiError(error);
  }
}
