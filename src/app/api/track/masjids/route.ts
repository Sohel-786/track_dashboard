import { NextRequest } from "next/server";
import connectDB from "@/lib/mongodb";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { fail, ok } from "@/lib/api-helpers";
import { resolveTrackRange } from "@/lib/track-range";
import { getMasjidReport } from "@/lib/track-service";
import { getUserSettings } from "@/lib/user-settings";

/** Masjid visits joined to the prayers logged inside them. */
export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    await connectDB();

    const { madhabId, trackingStart } = await getUserSettings(session.sub);
    const range = resolveTrackRange(
      request.nextUrl.searchParams,
      trackingStart
    );
    if (!range.ok) return fail(range.message);

    const masjids = await getMasjidReport(
      session.sub,
      range.from,
      range.to,
      madhabId
    );

    const totalVisits = masjids.reduce((sum, m) => sum + m.visitCount, 0);
    const totalMinutes = masjids.reduce((sum, m) => sum + m.totalMinutes, 0);
    const prayerCount = masjids.reduce((sum, m) => sum + m.prayerCount, 0);
    const zamaatCount = masjids.reduce((sum, m) => sum + m.zamaatCount, 0);

    return ok({
      appliedRange: { quick: range.quick, from: range.from, to: range.to },
      trackingStart,
      masjids,
      totals: {
        distinctMasjids: masjids.length,
        totalVisits,
        totalMinutes,
        averageMinutes: totalVisits > 0 ? Math.round(totalMinutes / totalVisits) : 0,
        prayerCount,
        zamaatCount,
        mostVisited: masjids.length
          ? [...masjids].sort((a, b) => b.visitCount - a.visitCount)[0].name
          : null,
      },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
