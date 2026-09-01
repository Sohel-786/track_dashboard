import { NextRequest } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import NamazLog from "@/models/NamazLog";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { fail, ok } from "@/lib/api-helpers";
import { NAMAZ_PRAYERS, isNamazPrayer } from "@/lib/namaz";
import { buildDayStatus } from "@/lib/namaz-analytics";
import { getUserSettings } from "@/lib/user-settings";
import {
  canMarkOnTimeNow,
  getNamazScheduleSnapshot,
  getNamazTodayIso,
  isPrayerWindowOpen,
  resolveOpenOnTimeDate,
} from "@/lib/prayer-times";
import type { NamazMadhabId } from "@/lib/namaz-madhab";

const upsertSchema = z.object({
  prayer: z.enum(NAMAZ_PRAYERS),
  prayed: z.boolean(),
  sunnah: z.boolean().optional(),
  tasbeeh: z.boolean().optional(),
  zamaat: z.boolean().optional(),
  /**
   * Optional calendar date for the prayer log. Required path for overnight
   * Isha (yesterday). When omitted, server resolves the open on-time date.
   */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

function mapLogs(
  logs: Array<{
    date: string;
    prayer: string;
    prayed: boolean;
    sunnah: boolean;
    tasbeeh: boolean;
    zamaat?: boolean;
    isKaza?: boolean;
    prayedAt?: Date | null;
    kazaAt?: Date | null;
  }>
) {
  return logs.map((l) => ({
    date: l.date,
    prayer: l.prayer,
    prayed: l.prayed,
    sunnah: l.sunnah,
    tasbeeh: l.tasbeeh,
    zamaat: Boolean(l.zamaat),
    isKaza: Boolean(l.isKaza),
    prayedAt: l.prayedAt,
    kazaAt: l.kazaAt,
  }));
}

/**
 * Today's checklist plus overnight Isha carryover when yesterday's Isha is
 * still within its on-time window (until Fajr).
 */
async function buildChecklistPayload(
  userId: string,
  now: Date,
  madhabId: NamazMadhabId,
  trackingStart: string
) {
  const schedule = getNamazScheduleSnapshot(now, madhabId);
  const date = schedule.today;

  const todayLogs = await NamazLog.find({
    userId,
    date,
  }).lean();

  const day = buildDayStatus(
    date,
    mapLogs(todayLogs),
    now,
    trackingStart,
    madhabId
  );

  const slotByPrayer = new Map(schedule.schedule.map((s) => [s.prayer, s]));

  const prayers: Array<
    (typeof day.prayers)[number] & {
      logDate: string;
      isOvernightCarryover: boolean;
      slot: (typeof schedule.schedule)[number] | null;
    }
  > = day.prayers.map((p) => ({
    ...p,
    logDate: date,
    isOvernightCarryover: false,
    slot: slotByPrayer.get(p.prayer) ?? null,
  }));

  const carryover = schedule.overnightIsha;
  if (carryover) {
    const overnightLog = await NamazLog.findOne({
      userId,
      date: carryover.date,
      prayer: "isha",
    }).lean();

    const overnightDay = buildDayStatus(
      carryover.date,
      mapLogs(overnightLog ? [overnightLog] : []),
      now,
      trackingStart,
      madhabId
    );
    const ishaRow = overnightDay.prayers.find((p) => p.prayer === "isha");
    if (ishaRow) {
      prayers.unshift({
        ...ishaRow,
        logDate: carryover.date,
        isOvernightCarryover: true,
        slot: carryover.slot,
        label: "Isha",
        windowHint: `From ${carryover.date} · still on time until Fajar`,
      });
    }
  }

  const prayedCount = prayers.filter((p) => p.status === "prayed").length;
  const kazaCount = prayers.filter((p) => p.status === "kaza").length;
  const missedCount = prayers.filter((p) => p.status === "missed").length;
  const graceCount = prayers.filter((p) => p.status === "grace").length;
  const pendingCount = prayers.filter(
    (p) =>
      p.status === "pending" ||
      p.status === "upcoming" ||
      p.status === "open"
  ).length;

  return {
    ...day,
    prayers,
    prayedCount,
    kazaCount,
    missedCount,
    graceCount,
    pendingCount,
    madhabId,
    trackingStart,
    schedule,
  };
}

/** Today's on-time checklist + authoritative Ahmedabad schedule (server clock). */
export async function GET() {
  try {
    const session = await requireSession();
    await connectDB();

    const now = new Date();
    const { madhabId, trackingStart } = await getUserSettings(session.sub);
    return ok(
      await buildChecklistPayload(session.sub, now, madhabId, trackingStart)
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await requireSession();
    await connectDB();

    const body = await request.json();
    const parsed = upsertSchema.safeParse(body);
    if (!parsed.success) {
      return fail("Invalid namaz payload");
    }

    const now = new Date();
    const { madhabId, trackingStart } = await getUserSettings(session.sub);
    const today = getNamazTodayIso(now);
    const { prayer, prayed } = parsed.data;
    if (!isNamazPrayer(prayer)) return fail("Invalid prayer");

    const resolvedOpen = resolveOpenOnTimeDate(prayer, now, madhabId);
    const date = parsed.data.date ?? resolvedOpen ?? today;

    if (date < trackingStart) {
      return fail(
        `Tracking starts on ${trackingStart}. Earlier dates cannot be logged.`
      );
    }

    /**
     * On-time writes are allowed while the window runs and, as a grace period,
     * for the remainder of that prayer's own day — a prayer offered in time can
     * still be ticked if the user forgot in the moment. After the IST day rolls
     * over it can only be cleared as Kaza.
     */
    const windowOpen = isPrayerWindowOpen(prayer, date, now, madhabId);
    const onTimeAllowed = canMarkOnTimeNow(prayer, date, now, madhabId);

    if (prayed) {
      if (!onTimeAllowed) {
        return fail(
          date < today
            ? "That day has ended — complete this prayer from the Kaza section."
            : "This prayer’s window has not started yet."
        );
      }
      // Reject spoofed dates that are open for a different prayer but not this flow.
      if (windowOpen && resolvedOpen && date !== resolvedOpen) {
        return fail(
          "That date is not the active on-time window for this prayer."
        );
      }
    }

    const sunnah = prayed ? Boolean(parsed.data.sunnah) : false;
    const tasbeeh = prayed ? Boolean(parsed.data.tasbeeh) : false;
    const zamaat = prayed ? Boolean(parsed.data.zamaat) : false;

    if (!prayed) {
      const existing = await NamazLog.findOne({
        userId: session.sub,
        date,
        prayer,
      });
      // A same-day Kaza can be undone here; older ones live in the Kaza section.
      if (existing?.isKaza && !onTimeAllowed) {
        return fail("Kaza entries can only be managed from the Kaza section.");
      }
      if (existing && !onTimeAllowed) {
        return fail("That day has ended — this entry can no longer be changed.");
      }
      await NamazLog.findOneAndDelete({
        userId: session.sub,
        date,
        prayer,
      });
      return ok(
        await buildChecklistPayload(session.sub, now, madhabId, trackingStart)
      );
    }

    const existing = await NamazLog.findOne({
      userId: session.sub,
      date,
      prayer,
    });

    await NamazLog.findOneAndUpdate(
      { userId: session.sub, date, prayer },
      {
        $set: {
          prayed: true,
          isKaza: false,
          // Logged in its own day, so it is not a Kaza-section backfill.
          backfilled: false,
          sunnah,
          tasbeeh,
          zamaat,
          prayedAt:
            existing?.prayedAt && !existing.isKaza ? existing.prayedAt : now,
          kazaAt: null,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return ok(
      await buildChecklistPayload(session.sub, now, madhabId, trackingStart)
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}
