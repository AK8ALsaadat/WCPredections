import { prisma } from "@/lib/prisma";
import { apiSuccess, handleApiError } from "@/lib/api";
import { getUserPredictionHistory } from "@/services/prediction.service";
import { buildMatchHistoryEntries } from "@/lib/profile-history";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;

    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      return apiSuccess({
        user: null,
        history: {
          predictions: [],
          scorerPredictions: [],
          boldScorerBets: [],
        },
      });
    }

    const history = await getUserPredictionHistory(user.id);

    const allEntries = buildMatchHistoryEntries(history);

    const finished = allEntries.filter(
      (entry) =>
        entry.match.status === "FINISHED" &&
        entry.match.homeScore != null &&
        entry.match.awayScore != null
    );

    const entries = finished.slice(0, 5);

    return apiSuccess({
      user: {
        id: user.id,
        username: user.username,
      },
      history: entries,
    });
  } catch (err) {
    return handleApiError(err);
  }
}