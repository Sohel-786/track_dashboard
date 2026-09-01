import { NextRequest } from "next/server";
import connectDB from "@/lib/mongodb";
import TrackVisit from "@/models/TrackVisit";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { fail, ok } from "@/lib/api-helpers";
import { resolveTrackRange } from "@/lib/track-range";
import { toVisitView } from "@/lib/track-service";
import { getUserSettings } from "@/lib/user-settings";

const MAX_LIMIT = 200;

/**
 * Individual stays in a window, newest first.
 *
 * The aggregated place lists answer "where do I spend my time"; this answers
 * "what was that one stop", which is what a correction needs — OSM does not
 * know every jamaat khana, so the user has to be able to point at a specific
 * stay and say what it actually was.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    await connectDB();

    const { searchParams } = request.nextUrl;
    const { trackingStart } = await getUserSettings(session.sub);
    const range = resolveTrackRange(searchParams, trackingStart);
    if (!range.ok) return fail(range.message);

    const query: Record<string, unknown> = {
      userId: session.sub,
      date: { $gte: range.from, $lte: range.to },
    };

    const kind = searchParams.get("kind");
    if (kind === "masjid" || kind === "place" || kind === "unknown") {
      query.placeKind = kind;
    }

    const requested = Number(searchParams.get("limit"));
    const limit = Number.isFinite(requested)
      ? Math.min(MAX_LIMIT, Math.max(1, requested))
      : 50;

    const [visits, total] = await Promise.all([
      TrackVisit.find(query).sort({ startedAt: -1 }).limit(limit).lean(),
      TrackVisit.countDocuments(query),
    ]);

    return ok({
      appliedRange: { quick: range.quick, from: range.from, to: range.to },
      trackingStart,
      visits: visits.map(toVisitView),
      total,
      limit,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
