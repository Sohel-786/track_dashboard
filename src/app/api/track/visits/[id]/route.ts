import { NextRequest } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import TrackVisit from "@/models/TrackVisit";
import MapPlace from "@/models/MapPlace";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { fail, isObjectId, ok } from "@/lib/api-helpers";
import { toVisitView } from "@/lib/track-service";

const patchSchema = z.object({
  /** Empty string clears the override and restores the OSM name. */
  customName: z.string().max(200).optional(),
  /**
   * Correct a mis-classified stay. OSM does not know every masjid — a small
   * jamaat khana in a residential building is often not mapped at all — so the
   * user has the last word on what a place is.
   */
  placeKind: z.enum(["masjid", "place", "unknown"]).optional(),
});

/** Rename a stay or correct what kind of place it was. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    await connectDB();

    const { id } = await params;
    if (!isObjectId(id)) return fail("Invalid visit id");

    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) return fail("Invalid visit update");

    const update: Record<string, unknown> = {};
    if (parsed.data.customName !== undefined) {
      update.customName = parsed.data.customName.trim().slice(0, 200);
    }
    if (parsed.data.placeKind !== undefined) {
      update.placeKind = parsed.data.placeKind;
      /**
       * A manual reclassification is an answer, so stop the resolver from
       * overwriting it on its next pass.
       */
      update.resolvedAt = new Date();
      if (parsed.data.placeKind === "masjid") {
        // Detach from whatever non-masjid place it had been matched to.
        const current = await TrackVisit.findOne({
          _id: id,
          userId: session.sub,
        })
          .select("place placeKind")
          .lean();
        if (current?.place) {
          const place = await MapPlace.findById(current.place)
            .select("kind")
            .lean();
          if (place && place.kind !== "masjid") update.place = null;
        }
      }
    }

    if (Object.keys(update).length === 0) return fail("Nothing to update");

    // Scoped by userId in the query itself — one account cannot touch another's.
    const visit = await TrackVisit.findOneAndUpdate(
      { _id: id, userId: session.sub },
      { $set: update },
      { new: true }
    ).lean();

    if (!visit) return fail("Visit not found", 404);
    return ok(toVisitView(visit));
  } catch (error) {
    return authErrorResponse(error);
  }
}

/**
 * Forget a stay.
 *
 * The raw fixes stay put, so the day's path and distance are unaffected — this
 * removes the *interpretation*, not the record. A later rebuild of that day
 * would re-detect it; use it to drop a stay that is simply not worth listing.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    await connectDB();

    const { id } = await params;
    if (!isObjectId(id)) return fail("Invalid visit id");

    const removed = await TrackVisit.findOneAndDelete({
      _id: id,
      userId: session.sub,
    }).lean();

    if (!removed) return fail("Visit not found", 404);
    return ok({ id, deleted: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
