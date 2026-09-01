import { NextRequest } from "next/server";
import connectDB from "@/lib/mongodb";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { fail, ok } from "@/lib/api-helpers";
import { isValidIsoDate } from "@/lib/date-ranges";
import { getTrackingSettings } from "@/lib/track-settings";
import { getDayTrack, trackDateFor } from "@/lib/track-service";
import { getUserSettings } from "@/lib/user-settings";

/** One day's track: the drawn path, its stays, the journeys between them. */
export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    await connectDB();

    const requested = request.nextUrl.searchParams.get("date");
    const date =
      requested && isValidIsoDate(requested)
        ? requested
        : trackDateFor(new Date());

    const [settings, { trackingStart }] = await Promise.all([
      getTrackingSettings(session.sub),
      getUserSettings(session.sub),
    ]);

    if (date < trackingStart) {
      return fail(`Tracking starts on ${trackingStart}.`);
    }

    const day = await getDayTrack(session.sub, date, settings);

    return ok({
      ...day,
      trackingStart,
      today: trackDateFor(new Date()),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
