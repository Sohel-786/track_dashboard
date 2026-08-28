import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * One Web Push endpoint — a single browser/PWA install on one device.
 * A user can hold several (phone, tablet, desktop); each is pushed separately.
 */
const PushSubscriptionSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    /** Push-service URL issued by the browser. Unique per device+install. */
    endpoint: { type: String, required: true, unique: true },
    /** Client public key for payload encryption. */
    p256dh: { type: String, required: true },
    /** Client auth secret for payload encryption. */
    auth: { type: String, required: true },
    /** Free-text device hint so a user can tell their devices apart. */
    device: { type: String, default: "", maxlength: 200 },
    /** Cleared automatically when the push service reports the endpoint gone. */
    lastSuccessAt: { type: Date, default: null },
    lastFailureAt: { type: Date, default: null },
    failureCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

PushSubscriptionSchema.index({ userId: 1, updatedAt: -1 });

export type IPushSubscription = InferSchemaType<
  typeof PushSubscriptionSchema
> & { _id: mongoose.Types.ObjectId };

const PushSubscription: Model<IPushSubscription> =
  mongoose.models.PushSubscription ||
  mongoose.model<IPushSubscription>("PushSubscription", PushSubscriptionSchema);

export default PushSubscription;
