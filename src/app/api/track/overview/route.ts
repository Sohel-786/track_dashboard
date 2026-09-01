import { NextRequest } from "next/server";
import connectDB from "@/lib/mongodb";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { fail, ok } from "@/lib/api-helpers";
import { resolveTrackRange } from "@/lib/track-range";
import { getRangeOverview, getPlaceStats } from "@/lib/track-service";
import { getUserSettings } from "@/lib/user-settings";

/** Distance, days, visits and the top places for a window. */
export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    await connectDB();

    const { trackingStart } = await getUserSettings(session.sub);
    const range = resolveTrackRange(
      request.nextUrl.searchParams,
      trackingStart
    );
    if (!range.ok) return fail(range.message);

    const [overview, places] = await Promise.all([
      getRangeOverview(session.sub, range.from, range.to),
      getPlaceStats(session.sub, range.from, range.to),
    ]);

    return ok({
      appliedRange: { quick: range.quick, from: range.from, to: range.to },
      trackingStart,
      ...overview,
      topPlaces: places.slice(0, 8),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
