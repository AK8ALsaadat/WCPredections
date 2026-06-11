import { apiSuccess, handleApiError } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { parseBody, matchUpdateSchema } from "@/lib/validations";
import { updateMatchResult } from "@/services/match.service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = await request.json();
    const data = parseBody(matchUpdateSchema, body);

    const match = await updateMatchResult(id, data);
    return apiSuccess(match);
  } catch (error) {
    return handleApiError(error);
  }
}
