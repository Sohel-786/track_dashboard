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

/**
 * How late a tick may be and still count as "the window just opened".
 *
 * The start ping is not on the interval — it fires the moment a prayer's time
 * begins, whatever the user's repeat setting. But the job runs on a scheduler,
 * and a scheduler can be late or restarted mid-afternoon; announcing "it's Asar
 * time" an hour into Asr would be worse than saying nothing. Past this grace the
 * first nudge is phrased as a reminder instead.
 */
export const START_PING_GRACE_MINUTES = 12;

/** A start announcement, or one of the repeats that follow it. */
export type ReminderKind = "start" | "repeat";

/** Reminder rows are only interesting while the day is recent. */
const REMINDER_TTL_DAYS = 7;

export type OpenPrayerSlot = {
  prayer: NamazPrayer;
  label: string;
  /** Calendar day the prayer belongs to — yesterday for overnight Isha. */
  date: string;
  startsAt: Date;
  startsAtLabel: string;
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
        startsAt: window.start,
        startsAtLabel: formatInNamazTz(window.start),
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
      startsAt: new Date(overnight.slot.startsAt),
      startsAtLabel: overnight.slot.startsAtLabel,
      endsAt: new Date(overnight.slot.endsAt),
      endsAtLabel: overnight.slot.endsAtLabel,
    };
  }

  return null;
}

function minutesLeft(endsAt: Date, now: Date) {
  return Math.max(0, Math.round((endsAt.getTime() - now.getTime()) / 60_000));
}

/**
 * What the user actually sees.
 *
 * The start ping announces the time itself — it is the whole point of the
 * feature and says nothing about being late. Every later nudge is phrased as a
 * reminder, and sharpens into "ends soon" once the window is nearly over.
 */
export function buildReminderPayload(
  slot: OpenPrayerSlot,
  now: Date,
  kind: ReminderKind
): PushPayload {
  const left = minutesLeft(slot.endsAt, now);
  const closing = left <= 30;
  const remaining =
    left >= 60
      ? `${Math.floor(left / 60)}h ${left % 60}m left`
      : `${left}m left`;

  const start = kind === "start";

  return {
    title: start
      ? `It's ${slot.label} time`
      : closing
        ? `${slot.label} ends soon`
        : `${slot.label} still unmarked`,
    body: start
      ? `${slot.startsAtLabel} – ${slot.endsAtLabel} · mark it once you've prayed`
      : `Until ${slot.endsAtLabel} · ${remaining}`,
    url: HOME_PATH,
    /** One live notification per prayer — a repeat replaces the last one. */
    tag: `namaz-${slot.date}-${slot.prayer}`,
    renotify: true,
    /** The call to prayer stays in the shade until it is acted on. */
    requireInteraction: start,
    data: {
      kind: start ? "namaz-start" : "namaz-reminder",
      prayer: slot.prayer,
      date: slot.date,
    },
    actions: [
      { action: "prayed", title: "Mark prayed" },
      { action: "open", title: "Open" },
    ],
  };
}

/**
 * Claim the right to notify this exact slot, atomically.
 *
 * Two things are being decided here at once, and only one of them involves the
 * user's interval:
 *
 * - **The start.** A slot with no row has never been announced, so the insert
 *   *is* the announcement — it happens as soon as the window opens, no matter
 *   whether the user picked 30m, 1h or 2h. The unique index means exactly one
 *   caller can win that insert, even if two ticks overlap.
 * - **The repeats.** Those are on the interval, measured from the last send —
 *   which, because the start ping set it, lands the first repeat one interval
 *   after the prayer time began.
 *
 * A row inserted long after the window opened (the scheduler was down, or newly
 * pointed at this deployment) is a reminder rather than a start ping: the time
 * it would be announcing has already passed.
 */
async function claimReminderSlot(
  slot: OpenPrayerSlot,
  userId: string,
  now: Date,
  intervalMinutes: number
): Promise<{ claimed: boolean; kind: ReminderKind }> {
  const dueBefore = new Date(now.getTime() - intervalMinutes * 60_000);
  const expiresAt = new Date(
    now.getTime() + REMINDER_TTL_DAYS * 24 * 60 * 60_000
  );
  const { date, prayer } = slot;

  const updated = await NamazReminder.findOneAndUpdate(
    { userId, date, prayer, lastSentAt: { $lte: dueBefore } },
    { $set: { lastSentAt: now, expiresAt }, $inc: { sentCount: 1 } },
    { new: true }
  ).lean();

  if (updated) return { claimed: true, kind: "repeat" };

  const sinceStartMinutes =
    (now.getTime() - slot.startsAt.getTime()) / 60_000;
  const atStart = sinceStartMinutes <= START_PING_GRACE_MINUTES;

  try {
    await NamazReminder.create({
      userId,
      date,
      prayer,
      lastSentAt: now,
      sentCount: 1,
      startAnnouncedAt: atStart ? now : null,
      expiresAt,
    });
    return { claimed: true, kind: atStart ? "start" : "repeat" };
  } catch {
    // Unique index rejected the insert — a row exists and is not due yet.
    return { claimed: false, kind: "repeat" };
  }
}

export type ReminderRunSummary = {
  checkedUsers: number;
  notifiedUsers: number;
  pushesSent: number;
  /** How many of the pushes were "it's prayer time" announcements. */
  startPings: number;
  skipped: number;
  openSlot: string | null;
};

/**
 * Send a reminder to every user whose current prayer is still unmarked.
 *
 * Meant to be called about once a minute: that is what makes the start ping
 * land on the prayer time rather than at the next coarse tick, and every call
 * that finds nothing due is a couple of indexed reads. A user is announced once
 * the moment the window opens, nudged again every
 * `namazReminderIntervalMinutes` after that, and left alone the moment the
 * prayer is marked or the window closes.
 */
export async function runNamazReminders(
  now = new Date()
): Promise<ReminderRunSummary> {
  const summary: ReminderRunSummary = {
    checkedUsers: 0,
    notifiedUsers: 0,
    pushesSent: 0,
    startPings: 0,
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

  /**
   * The open window depends on the school and nothing else, and there are only
   * a handful of schools — so the sun position is solved at most once per
   * school per tick instead of once per user.
   */
  const slotByMadhab = new Map<NamazMadhabId, OpenPrayerSlot | null>();
  const openSlotFor = (madhabId: NamazMadhabId) => {
    if (!slotByMadhab.has(madhabId)) {
      slotByMadhab.set(madhabId, getOpenPrayerSlot(now, madhabId));
    }
    return slotByMadhab.get(madhabId) ?? null;
  };

  for (const user of users) {
    const madhabId: NamazMadhabId = isNamazMadhabId(user.namazMadhab)
      ? user.namazMadhab
      : DEFAULT_NAMAZ_MADHAB;

    const slot = openSlotFor(madhabId);
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

    const { claimed, kind } = await claimReminderSlot(
      slot,
      String(user._id),
      now,
      interval
    );
    if (!claimed) {
      summary.skipped += 1;
      continue;
    }

    const result = await sendPushToUser(
      String(user._id),
      buildReminderPayload(slot, now, kind)
    );

    if (result.sent > 0) {
      summary.notifiedUsers += 1;
      summary.pushesSent += result.sent;
      if (kind === "start") summary.startPings += 1;
    }
  }

  return summary;
}
