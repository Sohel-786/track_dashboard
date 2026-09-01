import { NextRequest } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import TrackPoint from "@/models/TrackPoint";
import TrackVisit from "@/models/TrackVisit";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { fail, ok } from "@/lib/api-helpers";
import {
  TRACKING_LIMITS,
  getTrackingSettings,
  type TrackingSettings,
} from "@/lib/track-settings";
import {
  deleteAllTrackingData,
  rebuildVisitsForDay,
} from "@/lib/track-service";
import { NAMAZ_LOCATION_BASE } from "@/lib/prayer-times";

async function statusFor(userId: string, settings: TrackingSettings) {
  const [pointCount, visitCount, oldest, unresolved] = await Promise.all([
    TrackPoint.countDocuments({ userId }),
    TrackVisit.countDocuments({ userId }),
    TrackPoint.findOne({ userId }).sort({ ts: 1 }).select("date").lean(),
    TrackVisit.countDocuments({ userId, resolvedAt: null }),
  ]);

  return {
    settings,
    limits: TRACKING_LIMITS,
    stats: {
      pointCount,
      visitCount,
      unresolvedVisits: unresolved,
      firstTrackedDate: oldest?.date ?? null,
    },
    timeZone: NAMAZ_LOCATION_BASE.timeZone,
  };
}

export async function GET() {
  try {
    const session = await requireSession();
    await connectDB();
    const settings = await getTrackingSettings(session.sub);
    return ok(await statusFor(session.sub, settings));
  } catch (error) {
    return authErrorResponse(error);
  }
}

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  autoStart: z.boolean().optional(),
  highAccuracy: z.boolean().optional(),
  stayRadiusMeters: z
    .number()
    .int()
    .min(TRACKING_LIMITS.stayRadiusMeters.min)
    .max(TRACKING_LIMITS.stayRadiusMeters.max)
    .optional(),
  minStayMinutes: z
    .number()
    .int()
    .min(TRACKING_LIMITS.minStayMinutes.min)
    .max(TRACKING_LIMITS.minStayMinutes.max)
    .optional(),
  masjidRadiusMeters: z
    .number()
    .int()
    .min(TRACKING_LIMITS.masjidRadiusMeters.min)
    .max(TRACKING_LIMITS.masjidRadiusMeters.max)
    .optional(),
  retentionDays: z
    .number()
    .int()
    .min(TRACKING_LIMITS.retentionDays.min)
    .max(TRACKING_LIMITS.retentionDays.max)
    .optional(),
});

const FIELD_MAP = {
  enabled: "trackingEnabled",
  autoStart: "trackingAutoStart",
  highAccuracy: "trackingHighAccuracy",
  stayRadiusMeters: "trackingStayRadiusMeters",
  minStayMinutes: "trackingMinStayMinutes",
  masjidRadiusMeters: "trackingMasjidRadiusMeters",
  retentionDays: "trackingRetentionDays",
} as const;

/**
 * Change tracking preferences.
 *
 * Detection settings are not just a display choice — they define what counts as
 * a visit. Changing one therefore replays the last 30 days of stored fixes
 * through the new thresholds, so the history on screen always matches the
 * settings that produced it rather than whatever was in force at the time.
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await requireSession();
    await connectDB();

    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) return fail("Invalid tracking settings");

    const update: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(FIELD_MAP)) {
      const value = parsed.data[key as keyof typeof FIELD_MAP];
      if (value !== undefined) update[field] = value;
    }
    if (Object.keys(update).length === 0) return fail("Nothing to update");

    await User.findByIdAndUpdate(session.sub, { $set: update });
    const settings = await getTrackingSettings(session.sub);

    const detectionChanged =
      parsed.data.stayRadiusMeters !== undefined ||
      parsed.data.minStayMinutes !== undefined;

    let rebuiltDays = 0;
    if (detectionChanged) {
      const dates = await TrackPoint.distinct("date", { userId: session.sub });
      const recent = dates.sort().slice(-30);
      for (const date of recent) {
        await rebuildVisitsForDay(session.sub, date, settings);
        rebuiltDays += 1;
      }
    }

    return ok({
      ...(await statusFor(session.sub, settings)),
      rebuiltDays,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

/**
 * Erase every fix and visit this account holds.
 *
 * Location history is the most sensitive thing TrackDash stores, so deleting it
 * has to be one obvious action rather than a support request. It is immediate
 * and it is not recoverable.
 */
export async function DELETE() {
  try {
    const session = await requireSession();
    await connectDB();

    const removed = await deleteAllTrackingData(session.sub);
    const settings = await getTrackingSettings(session.sub);

    return ok({
      ...(await statusFor(session.sub, settings)),
      removed,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
