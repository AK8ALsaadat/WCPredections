import { apiSuccess, apiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/session";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("Not authenticated", 401);
  }
  return apiSuccess({ user });
}
