import { apiSuccess, handleApiError } from "@/lib/api";
import { getSession, requireAuth } from "@/lib/session";
import { markKnockoutTutorialSeen } from "@/lib/user.service";

export async function POST() {
  try {
    const user = await requireAuth();
    await markKnockoutTutorialSeen(user.userId);

    const session = await getSession();
    if (session.user) {
      session.user.hasSeenKnockoutTutorial = true;
      await session.save();
    }

    return apiSuccess({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
