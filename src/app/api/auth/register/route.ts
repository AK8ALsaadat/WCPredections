import { revalidatePath, revalidateTag } from "next/cache";
import { claimBoldFiveNotice, createUser } from "@/lib/auth";
import { apiSuccess, handleApiError } from "@/lib/api";
import { getSession } from "@/lib/session";
import { parseBody, registerSchema } from "@/lib/validations";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = parseBody(registerSchema, body);

    const user = await createUser(data.username, data.password);

    const session = await getSession();
    session.user = user;
    await session.save();

    revalidateTag("leaderboard-overall");
    revalidatePath("/leaderboard", "layout");
    revalidatePath("/dashboard");

    const showBoldFiveNotice = await claimBoldFiveNotice(user.userId);

    return apiSuccess({ user, showBoldFiveNotice }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
