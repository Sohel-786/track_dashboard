import User from "@/models/User";
import {
  getTrackingStartFloor,
  isValidIsoDate,
  isoDateInTimeZone,
  todayIso,
} from "@/lib/date-ranges";
import {
  DEFAULT_NAMAZ_MADHAB,
  isNamazMadhabId,
  type NamazMadhabId,
} from "@/lib/namaz-madhab";
import { NAMAZ_LOCATION_BASE } from "@/lib/prayer-times";

export type UserSettings = {
  madhabId: NamazMadhabId;
  /** First day this account counts. Never earlier than the account's creation. */
  trackingStart: string;
  /** True when the start came from the account's own creation date. */
  trackingStartIsImplicit: boolean;
};

const FALLBACK: UserSettings = {
  madhabId: DEFAULT_NAMAZ_MADHAB,
  trackingStart: todayIso(),
  trackingStartIsImplicit: true,
};

/**
 * Resolve the day an account starts tracking.
 *
 * Three inputs, strongest wins:
 *   1. the account's own `trackingStartDate`, when an admin has set one;
 *   2. otherwise the day the account was created;
 *   3. raised by the deployment-wide floor (NEXT_PUBLIC_TRACKING_START_DATE).
 *
 * Anchoring the default to account creation is what stops a fresh install from
 * presenting years of "missed" prayers: there is no such thing as a day this
 * user failed to record before the user existed.
 */
export function resolveTrackingStart(user: {
  trackingStartDate?: string | null;
  createdAt?: Date | string | null;
}): { trackingStart: string; trackingStartIsImplicit: boolean } {
  const explicit =
    typeof user.trackingStartDate === "string" &&
    isValidIsoDate(user.trackingStartDate)
      ? user.trackingStartDate
      : null;

  const created = user.createdAt ? new Date(user.createdAt) : null;
  const createdIso =
    created && !Number.isNaN(created.getTime())
      ? isoDateInTimeZone(created, NAMAZ_LOCATION_BASE.timeZone)
      : todayIso();

  const base = explicit ?? createdIso;
  const floor = getTrackingStartFloor();
  const start = base < floor ? floor : base;

  // Never let a mis-set future date hide today's own checklist.
  const today = todayIso();
  return {
    trackingStart: start > today ? today : start,
    trackingStartIsImplicit: explicit === null,
  };
}

/**
 * One lookup for everything per-user the API routes need, so a request does not
 * hit the users collection twice for madhab and tracking start separately.
 */
export async function getUserSettings(userId: string): Promise<UserSettings> {
  const user = await User.findById(userId)
    .select("namazMadhab trackingStartDate createdAt")
    .lean();

  if (!user) return { ...FALLBACK, trackingStart: todayIso() };

  const raw = (user as { namazMadhab?: string }).namazMadhab;
  return {
    madhabId: isNamazMadhabId(raw) ? raw : DEFAULT_NAMAZ_MADHAB,
    ...resolveTrackingStart(user),
  };
}

/** First day this account counts — see `resolveTrackingStart`. */
export async function getUserTrackingStart(userId: string): Promise<string> {
  return (await getUserSettings(userId)).trackingStart;
}
