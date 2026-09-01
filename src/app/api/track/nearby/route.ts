import { NextRequest } from "next/server";
import connectDB from "@/lib/mongodb";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { fail, ok } from "@/lib/api-helpers";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  bearingDegrees,
  compassPoint,
  distanceMeters,
  isFiniteLatLng,
  qiblaBearing,
} from "@/lib/geo";
import { findMasjidsNear } from "@/lib/osm";
import { getUserSettings } from "@/lib/user-settings";
import {
  computePrayerWindows,
  formatInNamazTz,
  getNamazTodayIso,
} from "@/lib/prayer-times";
import { NAMAZ_PRAYERS, NAMAZ_PRAYER_META } from "@/lib/namaz";

const MAX_RADIUS_M = 5000;
const DEFAULT_RADIUS_M = 1200;

/** Rough walking pace, for an honest "about N minutes on foot". */
const WALKING_SPEED_M_PER_MIN = 80;

/**
 * `lean()` hands back a Mongoose Map as a plain object, but a hydrated document
 * hands back a real Map. Normalise both so the JSON shape never depends on how
 * the document happened to be loaded.
 */
function plainTags(tags: unknown): Record<string, string> {
  if (!tags) return {};
  if (tags instanceof Map) return Object.fromEntries(tags);
  return tags as Record<string, string>;
}

/**
 * Masjids around a coordinate, plus the Qibla from it.
 *
 * The browser never calls OpenStreetMap directly — it asks this route, which
 * keeps the page's `connect-src` locked to the app's own origin and lets the
 * server cache what it finds for everyone.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();

    /** Each miss here can cost an Overpass sweep, so the cap is deliberate. */
    const limit = rateLimit(
      `nearby:${session.sub}:${clientIp(request.headers)}`,
      { limit: 30, windowMs: 10 * 60_000 }
    );
    if (!limit.ok) {
      return fail(
        `Too many lookups. Retry in ${limit.retryAfterSeconds}s.`,
        429
      );
    }

    await connectDB();

    const { searchParams } = request.nextUrl;
    const center = {
      lat: Number(searchParams.get("lat")),
      lng: Number(searchParams.get("lng")),
    };
    if (!isFiniteLatLng(center)) return fail("Invalid coordinates");

    const requested = Number(searchParams.get("radius"));
    const radius = Number.isFinite(requested)
      ? Math.min(MAX_RADIUS_M, Math.max(100, requested))
      : DEFAULT_RADIUS_M;

    const found = await findMasjidsNear(center, radius);
    const { madhabId } = await getUserSettings(session.sub);

    /**
     * Prayer times *here*, not at the app's fixed city. Display only — the
     * checklist keeps using the account's configured location, so nothing about
     * marking a prayer changes based on where the phone happens to be.
     */
    const today = getNamazTodayIso();
    const windows = computePrayerWindows(today, new Date(), madhabId);

    return ok({
      center,
      radius,
      qibla: {
        bearing: Math.round(qiblaBearing(center) * 10) / 10,
        compass: compassPoint(qiblaBearing(center)),
      },
      localTimes: NAMAZ_PRAYERS.map((prayer) => ({
        prayer,
        label: NAMAZ_PRAYER_META[prayer].label,
        startsAt: windows[prayer].start.toISOString(),
        startsAtLabel: formatInNamazTz(windows[prayer].start),
        endsAtLabel: formatInNamazTz(windows[prayer].end),
      })),
      masjids: found.map((place) => {
        const distance = distanceMeters(center, place);
        return {
          id: String(place._id),
          name: place.name,
          lat: place.lat,
          lng: place.lng,
          address: place.address,
          osmType: place.osmType,
          osmId: place.osmId,
          distanceMeters: Math.round(distance),
          bearing: Math.round(bearingDegrees(center, place)),
          compass: compassPoint(bearingDegrees(center, place)),
          walkMinutes: Math.max(1, Math.round(distance / WALKING_SPEED_M_PER_MIN)),
          tags: plainTags(place.tags),
        };
      }),
      count: found.length,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
