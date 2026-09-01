import { NextRequest } from "next/server";
import connectDB from "@/lib/mongodb";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { fail, ok } from "@/lib/api-helpers";
import { resolveTrackRange } from "@/lib/track-range";
import { getPlaceStats } from "@/lib/track-service";
import { getUserSettings } from "@/lib/user-settings";

/** Every place visited in a window, ranked by time spent there. */
export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    await connectDB();

    const { searchParams } = request.nextUrl;
    const { trackingStart } = await getUserSettings(session.sub);
    const range = resolveTrackRange(searchParams, trackingStart);
    if (!range.ok) return fail(range.message);

    const kind = searchParams.get("kind") === "masjid" ? "masjid" : undefined;
    const places = await getPlaceStats(
      session.sub,
      range.from,
      range.to,
      kind
    );

    return ok({
      appliedRange: { quick: range.quick, from: range.from, to: range.to },
      trackingStart,
      places,
      count: places.length,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
