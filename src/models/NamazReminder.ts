import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { NAMAZ_PRAYERS } from "@/lib/namaz";

/**
 * One row per user + calendar day + prayer, recording when that prayer was last
 * nudged. The reminder job reads it to answer a single question: has an hour
 * passed since the last nudge for this exact slot?
 *
 * Rows expire on their own a week after the prayer, so the collection stays the
 * size of "recent activity" rather than growing forever.
 */
const NamazReminderSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    /** Calendar day the prayer belongs to (YYYY-MM-DD, Ahmedabad). */
    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    prayer: { type: String, required: true, enum: NAMAZ_PRAYERS },
    lastSentAt: { type: Date, required: true },
    sentCount: { type: Number, default: 1, required: true },
    /** TTL anchor — MongoDB removes the row once this instant passes. */
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

NamazReminderSchema.index({ userId: 1, date: 1, prayer: 1 }, { unique: true });
NamazReminderSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type INamazReminder = InferSchemaType<typeof NamazReminderSchema> & {
  _id: mongoose.Types.ObjectId;
};

const NamazReminder: Model<INamazReminder> =
  mongoose.models.NamazReminder ||
  mongoose.model<INamazReminder>("NamazReminder", NamazReminderSchema);

export default NamazReminder;
