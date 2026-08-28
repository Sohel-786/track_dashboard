import User from "@/models/User";
import NamazLog from "@/models/NamazLog";
import NamazReminder from "@/models/NamazReminder";
import PushSubscription from "@/models/PushSubscription";
import { NAMAZ_PRAYERS, NAMAZ_PRAYER_META, type NamazPrayer } from "@/lib/namaz";
import { resolveTrackingStart } from "@/lib/user-settings";
import {
  DEFAULT_NAMAZ_MADHAB,
  isNamazMadhabId,
  type NamazMadhabId,
} from "@/lib/namaz-madhab";
import {
  formatInNamazTz,
  getNamazTodayIso,
  getOvernightIshaCarryover,
  getPrayerWindow,
} from "@/lib/prayer-times";
import { isPushConfigured, sendPushToUser, type PushPayload } from "@/lib/push";
import { HOME_PATH } from "@/lib/routes";

export const DEFAULT_REMINDER_INTERVAL_MINUTES = 60;
export const MIN_REMINDER_INTERVAL_MINUTES = 15;
export const MAX_REMINDER_INTERVAL_MINUTES = 180;

/** Reminder rows are only interesting while the day is recent. */
const REMINDER_TTL_DAYS = 7;

export type OpenPrayerSlot = {
  prayer: NamazPrayer;
  label: string;
  /** Calendar day the prayer belongs to — yesterday for overnight Isha. */
  date: string;
  endsAtLabel: string;
  endsAt: Date;
};

/**
 * The prayer whose window is running right now, if any.
 *
 * Windows are contiguous and non-overlapping, so at most one is open — except
 * between midnight and Fajr, when the open window belongs to *yesterday's*
 * Isha. Between sunrise and Dhuhr nothing is open and nobody is nudged.
 */
export function getOpenPrayerSlot(
  now: Date,
  madhabId: NamazMadhabId
): OpenPrayerSlot | null {
  const today = getNamazTodayIso(now);

  for (const prayer of NAMAZ_PRAYERS) {
    const window = getPrayerWindow(prayer, today, now, madhabId);
    if (window.phase === "open") {
      return {
        prayer,
        label: NAMAZ_PRAYER_META[prayer].label,
        date: today,
        endsAt: window.end,
        endsAtLabel: formatInNamazTz(window.end),
      };
    }
  }

  const overnight = getOvernightIshaCarryover(now, madhabId);
  if (overnight) {
    return {
      prayer: "isha",
      label: NAMAZ_PRAYER_META.isha.label,
      date: overnight.date,
      endsAt: new Date(overnight.slot.endsAt),
      endsAtLabel: overnight.slot.endsAtLabel,
    };
  }

  return null;
}

function minutesLeft(endsAt: Date, now: Date) {
  return Math.max(0, Math.round((endsAt.getTime() - now.getTime()) / 60_000));
}

export function buildReminderPayload(
  slot: OpenPrayerSlot,
  now: Date,
  repeat: boolean
): PushPayload {
  const left = minutesLeft(slot.endsAt, now);
  const closing = left <= 30;
  const remaining =
    left >= 60
      ? `${Math.floor(left / 60)}h ${left % 60}m left`
      : `${left}m left`;

  return {
    title: closing
      ? `${slot.label} ends soon`
      : repeat
        ? `${slot.label} still unmarked`
        : `${slot.label} time`,
    body: `Until ${slot.endsAtLabel} · ${remaining}`,
    url: HOME_PATH,
    /** One live notification per prayer — a repeat replaces the last one. */
    tag: `namaz-${slot.date}-${slot.prayer}`,
    renotify: true,
    requireInteraction: false,
    data: { kind: "namaz-reminder", prayer: slot.prayer, date: slot.date },
    actions: [
      { action: "prayed", title: "Mark prayed" },
      { action: "open", title: "Open" },
    ],
  };
}

/**
 * Claim the right to notify this exact slot, atomically.
 *
 * Two overlapping cron runs must not both send. The update only matches a row
 * whose last send is already older than the interval, so exactly one caller
 * wins; the insert path handles the very first reminder for the slot.
 */
async function claimReminderSlot(
  userId: string,
  date: string,
  prayer: NamazPrayer,
  now: Date,
  intervalMinutes: number
): Promise<{ claimed: boolean; repeat: boolean }> {
  const dueBefore = new Date(now.getTime() - intervalMinutes * 60_000);
  const expiresAt = new Date(
    now.getTime() + REMINDER_TTL_DAYS * 24 * 60 * 60_000
  );

  const updated = await NamazReminder.findOneAndUpdate(
    { userId, date, prayer, lastSentAt: { $lte: dueBefore } },
    { $set: { lastSentAt: now, expiresAt }, $inc: { sentCount: 1 } },
    { new: true }
  ).lean();

  if (updated) return { claimed: true, repeat: true };

  try {
    await NamazReminder.create({
      userId,
      date,
      prayer,
      lastSentAt: now,
      sentCount: 1,
      expiresAt,
    });
    return { claimed: true, repeat: false };
  } catch {
    // Unique index rejected the insert — a row exists and is not due yet.
    return { claimed: false, repeat: false };
  }
}

export type ReminderRunSummary = {
  checkedUsers: number;
  notifiedUsers: number;
  pushesSent: number;
  skipped: number;
  openSlot: string | null;
};

/**
 * Send a reminder to every user whose current prayer is still unmarked.
 *
 * Safe to call as often as you like: a user is nudged once when the window
 * opens and then at most once per `namazReminderIntervalMinutes`, and never
 * again once the prayer is marked or the window closes.
 */
export async function runNamazReminders(
  now = new Date()
): Promise<ReminderRunSummary> {
  const summary: ReminderRunSummary = {
    checkedUsers: 0,
    notifiedUsers: 0,
    pushesSent: 0,
    skipped: 0,
    openSlot: null,
  };

  if (!isPushConfigured()) return summary;

  // Only accounts with at least one registered device are worth looking at.
  const subscribedIds = await PushSubscription.distinct("userId");
  if (subscribedIds.length === 0) return summary;

  const users = await User.find({
    _id: { $in: subscribedIds },
    isActive: true,
    namazRemindersEnabled: true,
  })
    .select(
      "namazMadhab trackingStartDate createdAt namazReminderIntervalMinutes"
    )
    .lean();

  summary.checkedUsers = users.length;

  for (const user of users) {
    const madhabId: NamazMadhabId = isNamazMadhabId(user.namazMadhab)
      ? user.namazMadhab
      : DEFAULT_NAMAZ_MADHAB;

    const slot = getOpenPrayerSlot(now, madhabId);
    if (!slot) {
      summary.skipped += 1;
      continue;
    }
    summary.openSlot ??= `${slot.label} (${slot.date})`;

    const { trackingStart } = resolveTrackingStart(user);
    if (slot.date < trackingStart) {
      summary.skipped += 1;
      continue;
    }

    const log = await NamazLog.findOne({
      userId: user._id,
      date: slot.date,
      prayer: slot.prayer,
    })
      .select("prayed")
      .lean();

    if (log?.prayed) {
      summary.skipped += 1;
      continue;
    }

    const interval = Math.min(
      MAX_REMINDER_INTERVAL_MINUTES,
      Math.max(
        MIN_REMINDER_INTERVAL_MINUTES,
        user.namazReminderIntervalMinutes ?? DEFAULT_REMINDER_INTERVAL_MINUTES
      )
    );

    const { claimed, repeat } = await claimReminderSlot(
      String(user._id),
      slot.date,
      slot.prayer,
      now,
      interval
    );
    if (!claimed) {
      summary.skipped += 1;
      continue;
    }

    const result = await sendPushToUser(
      String(user._id),
      buildReminderPayload(slot, now, repeat)
    );

    if (result.sent > 0) {
      summary.notifiedUsers += 1;
      summary.pushesSent += result.sent;
    }
  }

  return summary;
}
