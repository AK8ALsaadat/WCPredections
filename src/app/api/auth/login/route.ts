import { authenticateUser } from "@/lib/auth";
import { apiSuccess, handleApiError } from "@/lib/api";
import { getSession } from "@/lib/session";
import { parseBody, loginSchema } from "@/lib/validations";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = parseBody(loginSchema, body);

    const user = await authenticateUser(data.username, data.password);
    if (!user) {
      return handleApiError(new Error("Invalid username or password"));
    }

    const session = await getSession();
    session.user = user;
    await session.save();

    return apiSuccess({ user });
  } catch (error) {
    return handleApiError(error);
  }
}
