import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * One GPS fix, exactly as the device reported it.
 *
 * Raw fixes are kept rather than only their rollups so a journey can be redrawn
 * later, exported, or re-analysed after the stay-detection settings change —
 * the derived visits in `TrackVisit` are always rebuildable from these.
 */
const TrackPointSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    /** Calendar day the fix belongs to (YYYY-MM-DD, Ahmedabad). */
    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    /** Instant of the fix, from the device clock. */
    ts: { type: Date, required: true },
    lat: { type: Number, required: true, min: -90, max: 90 },
    lng: { type: Number, required: true, min: -180, max: 180 },
    /** Horizontal accuracy in metres, as reported by the Geolocation API. */
    accuracy: { type: Number, default: null },
    /** Metres per second; null when the device could not determine it. */
    speed: { type: Number, default: null },
    altitude: { type: Number, default: null },
    /** Degrees clockwise from true north. */
    heading: { type: Number, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

/**
 * The same fix can be posted twice — the client retries whatever is still in
 * its offline queue, and a retry that overlaps a successful flush must not
 * double the day's distance.
 */
TrackPointSchema.index({ userId: 1, ts: 1 }, { unique: true });
TrackPointSchema.index({ userId: 1, date: 1, ts: 1 });

export type ITrackPoint = InferSchemaType<typeof TrackPointSchema> & {
  _id: mongoose.Types.ObjectId;
};

const TrackPoint: Model<ITrackPoint> =
  mongoose.models.TrackPoint ||
  mongoose.model<ITrackPoint>("TrackPoint", TrackPointSchema);

export default TrackPoint;
