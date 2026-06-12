import { prisma } from "@/lib/prisma";
import { apiSuccess, handleApiError } from "@/lib/api";
import { getUserPredictionHistory } from "@/services/prediction.service";
import { buildMatchHistoryEntries } from "@/lib/profile-history";

export async function GET(
  _req: Request,
  { params }: { params: { username: string } }
) {
  try {
    const username = params.username;
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) return apiSuccess({ user: null, history: { predictions: [], scorerPredictions: [], boldScorerBets: [] } });

    const history = await getUserPredictionHistory(user.id);

    // Build match entries, keep only finished matches, and return the most recent 5
    const allEntries = buildMatchHistoryEntries(history);
    const finished = allEntries.filter(
      (e) => e.match.status === "FINISHED" && e.match.homeScore != null && e.match.awayScore != null
    );
    const entries = finished.slice(0, 5);

    return apiSuccess({ user: { id: user.id, username: user.username }, history: entries });
  } catch (err) {
    return handleApiError(err);
  }
}
