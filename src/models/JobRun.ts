import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * Heartbeat for the out-of-process scheduler.
 *
 * Reminders are only ever as alive as whatever is calling
 * `/api/notifications/run`, and a deployment nobody is calling looks identical
 * to one whose delivery is broken: the toggle is on, the test button works, and
 * no reminder ever arrives. One row per job key records the last tick, so the
 * UI can tell those two apart — and so the expensive map upkeep can be paced
 * independently of the (cheap) reminder sweep.
 */
const JobRunSchema = new Schema(
  {
    /** Job identifier, e.g. `notifications` or `track-maintenance`. */
    key: { type: String, required: true, unique: true },
    lastRunAt: { type: Date, required: true },
    runCount: { type: Number, default: 1, required: true },
  },
  { timestamps: true }
);

export type IJobRun = InferSchemaType<typeof JobRunSchema> & {
  _id: mongoose.Types.ObjectId;
};

const JobRun: Model<IJobRun> =
  mongoose.models.JobRun || mongoose.model<IJobRun>("JobRun", JobRunSchema);

export default JobRun;
