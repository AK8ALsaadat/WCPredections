import { apiSuccess, handleApiError } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { parseBody, teamSchema } from "@/lib/validations";
import { createTeam, getTeams } from "@/services/match.service";

export async function GET() {
  try {
    await requireAdmin();
    const teams = await getTeams();
    return apiSuccess(teams);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = await request.json();
    const data = parseBody(teamSchema, body);

    const team = await createTeam(data);
    return apiSuccess(team, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
