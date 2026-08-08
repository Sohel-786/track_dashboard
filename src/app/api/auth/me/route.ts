import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { fail, ok } from "@/lib/api-helpers";

export async function GET() {
  try {
    const session = await requireSession();
    await connectDB();
    const user = await User.findById(session.sub).lean();
    if (!user || !user.isActive) {
      return fail("Unauthorized", 401);
    }
    return ok({
      id: String(user._id),
      username: user.username,
      name: user.name,
      role: user.role,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
