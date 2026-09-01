import { NextRequest } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import NamazLog from "@/models/NamazLog";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { fail, ok } from "@/lib/api-helpers";

import { isValidIsoDate } from "@/lib/date-ranges";
import { NAMAZ_PRAYERS, NAMAZ_PRAYER_META, isNamazPrayer } from "@/lib/namaz";
import {
  collectGraceToday,
  collectMissed,
  type KazaMissedItem,
} from "@/lib/namaz-analytics";
import { getUserSettings } from "@/lib/user-settings";
import {
  getNamazScheduleSnapshot,
  getNamazTodayIso,
  hasPrayerWindowEnded,
} from "@/lib/prayer-times";
import type { NamazMadhabId } from "@/lib/namaz-madhab";

const extrasSchema = {
  sunnah: z.boolean().optional(),
  tasbeeh: z.boolean().optional(),
  zamaat: z.boolean().optional(),
};

const singleSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  prayer: z.enum(NAMAZ_PRAYERS),
  /**
   * Record this slot as prayed **on time** instead of as a make-up, for the
   * day the user prayed but never opened the app. They still know which slots
   * were on time, and filing those as Kaza would misreport them. Stored as a
   * normal on-time log flagged `backfilled`, so it stays undoable from here.
   */
  onTime: z.boolean().optional(),
  ...extrasSchema,
});

/** Bulk make-up: every outstanding prayer on one day, or an explicit list. */
const bulkSchema = z.object({
  items: z.array(singleSchema).min(1).max(50),
});

const undoSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  prayer: z.enum(NAMAZ_PRAYERS),
});

type StoredLog = {
  date: string;
  prayer: string;
  prayed: boolean;
  sunnah: boolean;
  tasbeeh: boolean;
  zamaat?: boolean;
  isKaza?: boolean;
  backfilled?: boolean;
  prayedAt?: Date | null;
  kazaAt?: Date | null;
};

function mapLogs(logs: StoredLog[]) {
  return logs.map((l) => ({
    date: l.date,
    prayer: l.prayer,
    prayed: l.prayed,
    sunnah: l.sunnah,
    tasbeeh: l.tasbeeh,
    zamaat: Boolean(l.zamaat),
    isKaza: Boolean(l.isKaza),
    backfilled: Boolean(l.backfilled),
    prayedAt: l.prayedAt,
    kazaAt: l.kazaAt,
  }));
}

export type NamazKazaStats = {
  pending: number;
  days: number;
  oldestDate: string | null;
  oldestDaysAgo: number;
  byPrayer: Array<{ prayer: string; label: string; count: number }>;
};

function buildStats(outstanding: KazaMissedItem[]): NamazKazaStats {
  const days = new Set(outstanding.map((m) => m.date));
  const oldest = outstanding.reduce<KazaMissedItem | null>(
    (acc, m) => (!acc || m.date < acc.date ? m : acc),
    null
  );
  return {
    pending: outstanding.length,
    days: days.size,
    oldestDate: oldest?.date ?? null,
    oldestDaysAgo: oldest?.daysAgo ?? 0,
    byPrayer: NAMAZ_PRAYERS.map((prayer) => ({
      prayer,
      label: NAMAZ_PRAYER_META[prayer].label,
      count: outstanding.filter((m) => m.prayer === prayer).length,
    })),
  };
}

/**
 * Everything cleared from this workspace, newest first — powers the undo list.
 * Holds both make-ups and on-time entries backfilled here; on-time entries made
 * on the Today tab are not ours to undo, so they stay out.
 */
function recentCompletions(logs: ReturnType<typeof mapLogs>, limit = 30) {
  const doneAt = (l: { kazaAt?: Date | null; prayedAt?: Date | null }) =>
    l.kazaAt ?? l.prayedAt ?? null;

  return logs
    .filter((l) => l.prayed && (l.isKaza || l.backfilled))
    .sort((a, b) => {
      const aAt = doneAt(a) ? new Date(doneAt(a)!).getTime() : 0;
      const bAt = doneAt(b) ? new Date(doneAt(b)!).getTime() : 0;
      return bAt - aAt || b.date.localeCompare(a.date);
    })
    .slice(0, limit)
    .map((l) => {
      const at = doneAt(l);
      return {
        date: l.date,
        prayer: l.prayer,
        label: NAMAZ_PRAYER_META[l.prayer as keyof typeof NAMAZ_PRAYER_META]
          ?.label ?? l.prayer,
        /** How it was cleared, so the list can label and undo it correctly. */
        mode: l.isKaza ? ("kaza" as const) : ("ontime" as const),
        completedAt: at ? new Date(at).toISOString() : null,
        sunnah: Boolean(l.sunnah),
        tasbeeh: Boolean(l.tasbeeh),
        zamaat: Boolean(l.zamaat),
      };
    });
}

/**
 * Kaza workspace payload.
 * `outstanding` holds **past days only** — today's closed windows are still in
 * their same-day on-time grace and are returned separately as `graceToday`.
 */
async function buildQueue(
  userId: string,
  now: Date,
  madhabId: NamazMadhabId,
  trackingStart: string
) {
  const today = getNamazTodayIso(now);
  const schedule = getNamazScheduleSnapshot(now, madhabId);

  if (today < trackingStart) {
    return {
      trackingStart,
      madhabId,
      schedule,
      outstanding: [] as KazaMissedItem[],
      count: 0,
      graceToday: [] as KazaMissedItem[],
      recent: [] as ReturnType<typeof recentCompletions>,
      stats: buildStats([]),
    };
  }

  const logs = mapLogs(
    await NamazLog.find({
      userId,
      date: { $gte: trackingStart, $lte: today },
    }).lean()
  );

  const outstanding = collectMissed(
    trackingStart,
    today,
    logs,
    now,
    trackingStart,
    madhabId
  ).reverse();

  return {
    trackingStart,
    madhabId,
    schedule,
    outstanding,
    count: outstanding.length,
    graceToday: collectGraceToday(logs, now, trackingStart, madhabId),
    recent: recentCompletions(logs),
    stats: buildStats(outstanding),
  };
}

export async function GET() {
  try {
    const session = await requireSession();
    await connectDB();

    const now = new Date();
    const { madhabId, trackingStart } = await getUserSettings(session.sub);
    return ok(await buildQueue(session.sub, now, madhabId, trackingStart));
  } catch (error) {
    return authErrorResponse(error);
  }
}

type KazaWrite = z.infer<typeof singleSchema>;

/**
 * Validate + persist one completion — a make-up, or an on-time entry the user
 * is filing late (`item.onTime`). Returns an error string, or null on success.
 * Kept separate so bulk writes reuse exactly the same rules.
 */
async function applyCompletion(
  userId: string,
  item: KazaWrite,
  now: Date,
  today: string,
  trackingStart: string,
  madhabId: NamazMadhabId
): Promise<string | null> {
  const { date, prayer } = item;
  const onTime = Boolean(item.onTime);
  if (!isValidIsoDate(date) || !isNamazPrayer(prayer)) {
    return "Invalid date or prayer";
  }
  if (date > today) return "Cannot record future prayers.";
  if (date < trackingStart) {
    return `Tracking starts on ${trackingStart}. Earlier days cannot be recorded.`;
  }
  if (!hasPrayerWindowEnded(prayer, date, now, madhabId)) {
    return "This prayer’s window has not ended yet.";
  }

  const existing = await NamazLog.findOne({ userId, date, prayer });
  if (existing?.prayed && !existing.isKaza) {
    return "This prayer was already logged on time.";
  }
  if (existing?.prayed && existing.isKaza) {
    return onTime
      ? "Already completed as Kaza — undo it first to log it as on time."
      : "This Kaza is already completed.";
  }

  await NamazLog.findOneAndUpdate(
    { userId, date, prayer },
    {
      $set: {
        prayed: true,
        isKaza: !onTime,
        // Marks a retroactive on-time entry so this workspace can still undo it.
        backfilled: onTime,
        sunnah: Boolean(item.sunnah),
        tasbeeh: Boolean(item.tasbeeh),
        zamaat: Boolean(item.zamaat),
        prayedAt: existing?.prayedAt ?? now,
        kazaAt: onTime ? null : now,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return null;
}

/**
 * Complete one prayer (`{date, prayer}`) or several at once (`{items: [...]}`),
 * each as Kaza or — with `onTime` — as an on-time prayer logged after the fact.
 * Only allowed after each prayer's end time (adhan / server clock).
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await requireSession();
    await connectDB();

    const body = await request.json();
    const bulk = bulkSchema.safeParse(body);
    const single = bulk.success ? null : singleSchema.safeParse(body);
    if (!bulk.success && !single?.success) {
      return fail("Invalid kaza payload");
    }

    const items: KazaWrite[] = bulk.success
      ? bulk.data.items
      : [single!.data as KazaWrite];

    const now = new Date();
    const { madhabId, trackingStart } = await getUserSettings(session.sub);
    const today = getNamazTodayIso(now);

    const errors: string[] = [];
    let completed = 0;
    for (const item of items) {
      const error = await applyCompletion(
        session.sub,
        item,
        now,
        today,
        trackingStart,
        madhabId
      );
      if (error) {
        errors.push(
          `${NAMAZ_PRAYER_META[item.prayer].label} · ${item.date}: ${error}`
        );
      } else {
        completed += 1;
      }
    }

    // A single-item request keeps its strict contract: nothing saved is an error.
    if (completed === 0) {
      return fail(errors[0] ?? "Nothing could be saved");
    }

    return ok({
      ...(await buildQueue(session.sub, now, madhabId, trackingStart)),
      completed,
      skipped: errors.length,
      errors,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

/**
 * Undo an entry recorded here by mistake — drops the log for that slot so it
 * returns to the queue. Limited to this workspace's own writes (a make-up, or
 * an on-time entry backfilled here); Today's entries belong to the Today tab.
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await requireSession();
    await connectDB();

    const parsed = undoSchema.safeParse(await request.json());
    if (!parsed.success) return fail("Invalid undo payload");

    const { date, prayer } = parsed.data;
    const existing = await NamazLog.findOne({
      userId: session.sub,
      date,
      prayer,
    });
    if (!existing) return fail("Nothing to undo for that prayer", 404);
    if (!existing.isKaza && !existing.backfilled) {
      return fail("Only entries recorded in the Kaza section can be undone here.");
    }

    await NamazLog.deleteOne({ _id: existing._id });

    const now = new Date();
    const { madhabId, trackingStart } = await getUserSettings(session.sub);
    return ok({
      ...(await buildQueue(session.sub, now, madhabId, trackingStart)),
      undone: { date, prayer },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
