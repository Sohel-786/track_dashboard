import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * A stay: a run of fixes that stopped moving in one spot for long enough to
 * count as "being somewhere" rather than passing through.
 *
 * Derived from `TrackPoint`, never written by the client. A day's visits are
 * rebuilt wholesale whenever new fixes land for that day, so the rows are
 * always consistent with the raw track and with the current detection
 * settings — see `rebuildVisitsForDay`.
 */
const TrackVisitSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    /** Calendar day the stay started on (YYYY-MM-DD, Ahmedabad). */
    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, required: true },
    durationMinutes: { type: Number, required: true, min: 0 },
    /** Centroid of the fixes that make up the stay. */
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    /** How far the fixes spread from the centroid — a confidence hint. */
    spreadMeters: { type: Number, default: 0 },
    pointCount: { type: Number, default: 0 },

    /* ------------------------------------------------- resolved identity */

    place: { type: Schema.Types.ObjectId, ref: "MapPlace", default: null },
    /** Denormalised so the visit list renders without a second query. */
    placeName: { type: String, default: "", maxlength: 200 },
    placeKind: {
      type: String,
      enum: ["masjid", "place", "unknown"],
      default: "unknown",
      required: true,
    },
    /** Metres from the stay centroid to the matched place. */
    placeDistanceMeters: { type: Number, default: null },
    /**
     * Null until the naming pass has run. Kept separate from `place` so an
     * honest "we looked and found nothing" is distinguishable from "not yet
     * looked at", and the resolver does not retry the former forever.
     */
    resolvedAt: { type: Date, default: null },
    resolveAttempts: { type: Number, default: 0 },
    /** User-supplied label; always wins over whatever OSM returned. */
    customName: { type: String, default: "", maxlength: 200 },
  },
  { timestamps: true }
);

/**
 * A stay is identified by when it began, which makes the day rebuild an
 * idempotent upsert rather than a delete-and-reinsert that would throw away
 * every resolved name each time a fix arrives.
 */
TrackVisitSchema.index({ userId: 1, startedAt: 1 }, { unique: true });
TrackVisitSchema.index({ userId: 1, date: -1 });
TrackVisitSchema.index({ userId: 1, placeKind: 1, startedAt: -1 });
TrackVisitSchema.index({ userId: 1, resolvedAt: 1 });

export type ITrackVisit = InferSchemaType<typeof TrackVisitSchema> & {
  _id: mongoose.Types.ObjectId;
};

const TrackVisit: Model<ITrackVisit> =
  mongoose.models.TrackVisit ||
  mongoose.model<ITrackVisit>("TrackVisit", TrackVisitSchema);

export default TrackVisit;
