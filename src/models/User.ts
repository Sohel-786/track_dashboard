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
  },
  { timestamps: true }
);

export type IUser = InferSchemaType<typeof UserSchema> & {
  _id: mongoose.Types.ObjectId;
};

const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>("User", UserSchema);

export default User;
