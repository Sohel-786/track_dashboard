import { NextRequest } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import TrackPoint from "@/models/TrackPoint";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { fail, ok } from "@/lib/api-helpers";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getTrackingSettings } from "@/lib/track-settings";
import {
  getDayTrack,
  purgeExpiredPoints,
  rebuildVisitsForDay,
  trackDateFor,
} from "@/lib/track-service";

/** One flush carries at most this many fixes; the client batches to suit. */
const MAX_BATCH = 500;

/** A queued fix older than this is history the client should stop replaying. */
const MAX_BACKLOG_DAYS = 14;

/** Device clocks drift; anything further ahead than this is wrong, not early. */
const MAX_CLOCK_SKEW_MS = 5 * 60_000;

const pointSchema = z.object({
  ts: z.string().datetime(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(100_000).nullable().optional(),
  speed: z.number().min(-1).max(1000).nullable().optional(),
  altitude: z.number().min(-500).max(20_000).nullable().optional(),
  heading: z.number().min(0).max(360).nullable().optional(),
});

const batchSchema = z.object({
  points: z.array(pointSchema).min(1).max(MAX_BATCH),
});

/**
 * Accept a batch of GPS fixes from the browser.
 *
 * The client buffers fixes and retries whatever it could not send, so the same
 * fix will arrive twice — the unique `(userId, ts)` index makes that harmless,
 * and `ordered: false` lets the rest of a batch land around a duplicate rather
 * than failing the whole flush.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();

    const limit = rateLimit(`track:${session.sub}:${clientIp(request.headers)}`, {
      limit: 180,
      windowMs: 10 * 60_000,
    });
    if (!limit.ok) {
      return fail(
        `Too many location updates. Retry in ${limit.retryAfterSeconds}s.`,
        429
      );
    }

    await connectDB();
    const settings = await getTrackingSettings(session.sub);

    /**
     * A tab left open after the switch was turned off would otherwise keep
     * writing. Consent is checked on the write, not only in the UI.
     */
    if (!settings.enabled) {
      return fail("Location tracking is turned off for this account.", 403);
    }

    const parsed = batchSchema.safeParse(await request.json());
    if (!parsed.success) return fail("Invalid location batch");

    const now = Date.now();
    const floor = now - MAX_BACKLOG_DAYS * 24 * 60 * 60 * 1000;

    const documents = parsed.data.points
      .map((point) => ({ ...point, at: new Date(point.ts).getTime() }))
      .filter(
        (point) =>
          Number.isFinite(point.at) &&
          point.at >= floor &&
          point.at <= now + MAX_CLOCK_SKEW_MS
      )
      .map((point) => {
        const ts = new Date(point.at);
        return {
          userId: session.sub,
          date: trackDateFor(ts),
          ts,
          lat: point.lat,
          lng: point.lng,
          accuracy: point.accuracy ?? null,
          // The Geolocation API reports -1 for "unknown", not a real speed.
          speed:
            point.speed != null && point.speed >= 0 ? point.speed : null,
          altitude: point.altitude ?? null,
          heading: point.heading ?? null,
        };
      });

    if (documents.length === 0) return fail("No usable fixes in batch");

    let accepted = 0;
    try {
      const inserted = await TrackPoint.insertMany(documents, {
        ordered: false,
        // Duplicates are expected on retry — report them, do not throw.
        throwOnValidationError: false,
      });
      accepted = inserted.length;
    } catch (error) {
      // A bulk write that hit duplicates still inserted the rest.
      const bulk = error as { insertedDocs?: unknown[]; result?: { nInserted?: number } };
      accepted = bulk.insertedDocs?.length ?? bulk.result?.nInserted ?? 0;
    }

    const dates = [...new Set(documents.map((document) => document.date))];
    for (const date of dates) {
      await rebuildVisitsForDay(session.sub, date, settings);
    }

    await purgeExpiredPoints(session.sub, settings.retentionDays);

    const today = trackDateFor(new Date());
    const day = await getDayTrack(session.sub, today, settings);

    return ok({
      received: parsed.data.points.length,
      accepted,
      duplicates: documents.length - accepted,
      dates,
      today: {
        date: day.date,
        summary: day.summary,
        visitCount: day.visits.length,
        masjidVisits: day.visits.filter((visit) => visit.isMasjid).length,
      },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
