import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * One logged value. Multiple entries are allowed for the same
 * user + category + calendar day (daily target is met by the day's sum).
 */
const EntrySchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },
    value: {
      type: Number,
      required: true,
      min: 0,
    },
    /** Calendar day in YYYY-MM-DD (local user intent). */
    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
      index: true,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
  },
  { timestamps: true }
);

// Non-unique: many small entries per category per day are expected.
EntrySchema.index({ userId: 1, date: 1, categoryId: 1 });
EntrySchema.index({ userId: 1, date: -1, createdAt: -1 });

export type IEntry = InferSchemaType<typeof EntrySchema> & {
  _id: mongoose.Types.ObjectId;
};

const Entry: Model<IEntry> =
  mongoose.models.Entry || mongoose.model<IEntry>("Entry", EntrySchema);

export default Entry;
