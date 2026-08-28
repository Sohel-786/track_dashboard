import connectDB from "@/lib/mongodb";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { fail, ok } from "@/lib/api-helpers";
import { isPushConfigured, sendPushToUser } from "@/lib/push";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { HOME_PATH } from "@/lib/routes";

/** Fire a notification at the caller's own devices, to prove delivery works. */
export async function POST(request: Request) {
  try {
    const session = await requireSession();

    const limited = rateLimit(
      `push-test:${session.sub}:${clientIp(request.headers)}`,
      { limit: 5, windowMs: 5 * 60_000 }
    );
    if (!limited.ok) {
      return fail("Too many test notifications. Try again shortly.", 429);
    }

    if (!isPushConfigured()) {
      return fail("Push notifications are not configured on this server", 503);
    }

    await connectDB();
    const result = await sendPushToUser(session.sub, {
      title: "TrackDash reminders are on",
      body: "You will be nudged while a prayer is still unmarked.",
      url: HOME_PATH,
      tag: "namaz-test",
      data: { kind: "test" },
    });

    if (result.sent === 0) {
      return fail(
        "No device received it — allow notifications for this site and try again.",
        400
      );
    }

    return ok(result);
  } catch (error) {
    return authErrorResponse(error);
  }
}
