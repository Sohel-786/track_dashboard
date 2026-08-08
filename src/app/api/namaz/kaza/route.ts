import { NextRequest } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import NamazLog from "@/models/NamazLog";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { fail, ok } from "@/lib/api-helpers";
import { getTrackingStartDate, isValidIsoDate } from "@/lib/date-ranges";
import { NAMAZ_PRAYERS, isNamazPrayer } from "@/lib/namaz";
import { collectMissed } from "@/lib/namaz-analytics";
import { getUserNamazMadhab } from "@/lib/namaz-user";
import {
  getNamazScheduleSnapshot,
  getNamazTodayIso,
  hasPrayerWindowEnded,
} from "@/lib/prayer-times";

const kazaSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  prayer: z.enum(NAMAZ_PRAYERS),
  sunnah: z.boolean().optional(),
  tasbeeh: z.boolean().optional(),
  zamaat: z.boolean().optional(),
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
 * Outstanding Kaza queue — prayers whose end time has passed and are still open.
 */
export async function GET() {
  try {
    const session = await requireSession();
    await connectDB();

    const now = new Date();
    const madhabId = await getUserNamazMadhab(session.sub);
    const today = getNamazTodayIso(now);
    const trackingStart = getTrackingStartDate();
    const schedule = getNamazScheduleSnapshot(now, madhabId);

    if (today < trackingStart) {
      return ok({
        trackingStart,
        madhabId,
        schedule,
        outstanding: [] as ReturnType<typeof collectMissed>,
        count: 0,
      });
    }

    const logs = await NamazLog.find({
      userId: session.sub,
      date: { $gte: trackingStart, $lte: today },
    }).lean();

    const outstanding = collectMissed(
      trackingStart,
      today,
      mapLogs(logs),
      now,
      trackingStart,
      madhabId
    ).reverse();

    return ok({
      trackingStart,
      madhabId,
      schedule,
      outstanding,
      count: outstanding.length,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

/** Complete a prayer as Kaza only after its end time (adhan / server clock). */
export async function PUT(request: NextRequest) {
  try {
    const session = await requireSession();
    await connectDB();

    const body = await request.json();
    const parsed = kazaSchema.safeParse(body);
    if (!parsed.success) return fail("Invalid kaza payload");

    const { date, prayer } = parsed.data;
    if (!isValidIsoDate(date) || !isNamazPrayer(prayer)) {
      return fail("Invalid date or prayer");
    }

    const now = new Date();
    const madhabId = await getUserNamazMadhab(session.sub);
    const today = getNamazTodayIso(now);
    const trackingStart = getTrackingStartDate();

    if (date > today) {
      return fail("Cannot make up future prayers.");
    }
    if (date < trackingStart) {
      return fail(
        `Tracking starts on ${trackingStart}. Earlier days cannot be made up.`
      );
    }
    if (!hasPrayerWindowEnded(prayer, date, now, madhabId)) {
      return fail(
        "Kaza is only allowed after this prayer’s end time. Use today’s checklist while the window is open."
      );
    }

    const existing = await NamazLog.findOne({
      userId: session.sub,
      date,
      prayer,
    });

    if (existing?.prayed && !existing.isKaza) {
      return fail("This prayer was already logged on time.");
    }
    if (existing?.prayed && existing.isKaza) {
      return fail("This Kaza is already completed.");
    }

    await NamazLog.findOneAndUpdate(
      { userId: session.sub, date, prayer },
      {
        $set: {
          prayed: true,
          isKaza: true,
          sunnah: Boolean(parsed.data.sunnah),
          tasbeeh: Boolean(parsed.data.tasbeeh),
          zamaat: Boolean(parsed.data.zamaat),
          prayedAt: existing?.prayedAt ?? now,
          kazaAt: now,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const logs = await NamazLog.find({
      userId: session.sub,
      date: { $gte: trackingStart, $lte: today },
    }).lean();

    const outstanding = collectMissed(
      trackingStart,
      today,
      mapLogs(logs),
      now,
      trackingStart,
      madhabId
    ).reverse();

    return ok({
      trackingStart,
      madhabId,
      schedule: getNamazScheduleSnapshot(now, madhabId),
      completed: { date, prayer, isKaza: true },
      outstanding,
      count: outstanding.length,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
