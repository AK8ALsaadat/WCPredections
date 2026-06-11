import { apiSuccess, handleApiError } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { parseBody, roundSchema } from "@/lib/validations";
import { createRound, getRounds } from "@/services/match.service";

export async function GET() {
  try {
    await requireAdmin();
    const rounds = await getRounds();
    return apiSuccess(rounds);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = await request.json();
    const data = parseBody(roundSchema, body);

    const round = await createRound({
      name: data.name,
      startsAt: new Date(data.startsAt),
      endsAt: new Date(data.endsAt),
    });

    return apiSuccess(round, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
