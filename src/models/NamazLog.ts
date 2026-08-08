import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { NAMAZ_PRAYERS } from "@/lib/namaz";

/**
 * One checklist row per user + calendar day + prayer.
 * Missed past prayers are derived until completed on-time or via Kaza.
 */
const NamazLogSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    /** Calendar day YYYY-MM-DD (the day the prayer belonged to) */
    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
      index: true,
    },
    prayer: {
      type: String,
      required: true,
      enum: NAMAZ_PRAYERS,
    },
    /** Fard / main prayer completed (on-time or kaza) */
    prayed: {
      type: Boolean,
      required: true,
      default: false,
    },
    /** True when this prayer was made up after the day ended (Kaza) */
    isKaza: {
      type: Boolean,
      required: true,
      default: false,
    },
    /** Optional sunnah with this prayer */
    sunnah: {
      type: Boolean,
      required: true,
      default: false,
    },
    /** Optional tasbeeh after prayer */
    tasbeeh: {
      type: Boolean,
      required: true,
      default: false,
    },
    prayedAt: {
      type: Date,
      default: null,
    },
    kazaAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

NamazLogSchema.index({ userId: 1, date: 1, prayer: 1 }, { unique: true });
NamazLogSchema.index({ userId: 1, date: -1 });
NamazLogSchema.index({ userId: 1, isKaza: 1, date: -1 });

export type INamazLog = InferSchemaType<typeof NamazLogSchema> & {
  _id: mongoose.Types.ObjectId;
};

const NamazLog: Model<INamazLog> =
  mongoose.models.NamazLog ||
  mongoose.model<INamazLog>("NamazLog", NamazLogSchema);

export default NamazLog;
