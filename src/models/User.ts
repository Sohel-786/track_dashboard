import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const UserSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 64,
    },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    role: {
      type: String,
      enum: ["admin", "user"],
      default: "user",
      required: true,
    },
    isActive: { type: Boolean, default: true, required: true },
    /** Prayer-school preference for Asr window (hanafi | shafi | maliki | hanbali). */
    namazMadhab: {
      type: String,
      enum: ["hanafi", "shafi", "maliki", "hanbali"],
      default: "hanafi",
    },
    /**
     * First calendar day (YYYY-MM-DD) this account tracks. Nothing before it is
     * ever counted as a missed prayer or charted as a zero day.
     *
     * Null means "the day this account was created", which is the correct
     * default — a new user must never inherit a backlog of days from before
     * they existed.
     */
    trackingStartDate: {
      type: String,
      match: /^\d{4}-\d{2}-\d{2}$/,
      default: null,
    },
    /**
     * Bumped whenever every existing session for this account must stop being
     * trusted — password reset, deactivation, role change. Session tokens carry
     * the value they were minted with, so an old token fails the check even
     * though its signature is still valid.
     */
    sessionVersion: { type: Number, default: 0, required: true },
    /**
     * When the password was last changed. Null for an account still on the one
     * it was created with. Shown to admins so a reset can be confirmed at a
     * glance, and so a stale credential is visible before it is a problem.
     */
    passwordChangedAt: { type: Date, default: null },
    /** Push reminders for prayers still unmarked inside their window. */
    namazRemindersEnabled: { type: Boolean, default: true, required: true },
    /** Minutes between repeat reminders for the same prayer (15–180). */
    namazReminderIntervalMinutes: {
      type: Number,
      default: 60,
      min: 15,
      max: 180,
      required: true,
    },

    /**
     * Location tracking is opt-in and off until the user turns it on. Nothing
     * about a person's movements is recorded by default, and the switch is
     * theirs — an admin cannot enable it on someone's behalf.
     */
    trackingEnabled: { type: Boolean, default: false, required: true },
    /** Resume tracking automatically when the map page opens. */
    trackingAutoStart: { type: Boolean, default: false, required: true },
    /** Ask the GPS chip for its best fix — more accurate, more battery. */
    trackingHighAccuracy: { type: Boolean, default: true, required: true },
    /** Fixes within this radius of each other count as standing still (m). */
    trackingStayRadiusMeters: {
      type: Number,
      default: 80,
      min: 20,
      max: 500,
      required: true,
    },
    /** A stop shorter than this is passing through, not a visit (minutes). */
    trackingMinStayMinutes: {
      type: Number,
      default: 5,
      min: 1,
      max: 120,
      required: true,
    },
    /** How close a stay must be to a masjid to be counted as a visit to it (m). */
    trackingMasjidRadiusMeters: {
      type: Number,
      default: 150,
      min: 30,
      max: 600,
      required: true,
    },
    /** Days of raw track history to keep. 0 keeps everything. */
    trackingRetentionDays: {
      type: Number,
      default: 0,
      min: 0,
      max: 3650,
      required: true,
    },
  },
  { timestamps: true }
);

export type IUser = InferSchemaType<typeof UserSchema> & {
  _id: mongoose.Types.ObjectId;
};

const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>("User", UserSchema);

export default User;
