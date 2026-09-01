import { NextRequest } from "next/server";
import connectDB from "@/lib/mongodb";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { fail, ok } from "@/lib/api-helpers";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getTrackingSettings } from "@/lib/track-settings";
import { resolvePendingVisits } from "@/lib/track-service";

/** OSM lookups are throttled, so this needs more than the default budget. */
export const maxDuration = 60;

/**
 * Name a few outstanding stays.
 *
 * Kept out of the ingest path on purpose: an OSM round trip takes seconds, and
 * nothing about recording a fix should wait on a third party being reachable.
 * The map page calls this after it loads, so names fill in behind the UI.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();

    const limit = rateLimit(
      `resolve:${session.sub}:${clientIp(request.headers)}`,
      { limit: 20, windowMs: 10 * 60_000 }
    );
    if (!limit.ok) {
      return fail(
        `Naming is catching up. Retry in ${limit.retryAfterSeconds}s.`,
        429
      );
    }

    await connectDB();
    const settings = await getTrackingSettings(session.sub);

    return ok(await resolvePendingVisits(session.sub, settings, 3, 25_000));
  } catch (error) {
    return authErrorResponse(error);
  }
}
