import { NextRequest } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import NamazLog from "@/models/NamazLog";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { fail, ok } from "@/lib/api-helpers";
import { getTrackingStartDate } from "@/lib/date-ranges";
import { NAMAZ_PRAYERS, isNamazPrayer } from "@/lib/namaz";
import { buildDayStatus } from "@/lib/namaz-analytics";
import { getUserNamazMadhab } from "@/lib/namaz-user";
import {
  getNamazScheduleSnapshot,
  getNamazTodayIso,
  isPrayerWindowOpen,
} from "@/lib/prayer-times";

const upsertSchema = z.object({
  prayer: z.enum(NAMAZ_PRAYERS),
  prayed: z.boolean(),
  sunnah: z.boolean().optional(),
  tasbeeh: z.boolean().optional(),
});

function mapLogs(
  logs: Array<{
    date: string;
    prayer: string;
    prayed: boolean;
    sunnah: boolean;
    tasbeeh: boolean;
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
    isKaza: Boolean(l.isKaza),
    prayedAt: l.prayedAt,
    kazaAt: l.kazaAt,
  }));
}

/** Today's on-time checklist + authoritative Ahmedabad schedule (server clock). */
export async function GET() {
  try {
    const session = await requireSession();
    await connectDB();

    const now = new Date();
    const madhabId = await getUserNamazMadhab(session.sub);
    const schedule = getNamazScheduleSnapshot(now, madhabId);
    const date = schedule.today;
    const trackingStart = getTrackingStartDate();

    const logs = await NamazLog.find({
      userId: session.sub,
      date,
    }).lean();

    const day = buildDayStatus(
      date,
      mapLogs(logs),
      now,
      trackingStart,
      madhabId
    );

    return ok({
      ...day,
      madhabId,
      schedule,
    });
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
    const madhabId = await getUserNamazMadhab(session.sub);
    const date = getNamazTodayIso(now);
    const trackingStart = getTrackingStartDate();
    const { prayer, prayed } = parsed.data;
    if (!isNamazPrayer(prayer)) return fail("Invalid prayer");
    if (date < trackingStart) {
      return fail(
        `Tracking starts on ${trackingStart}. Earlier dates cannot be logged.`
      );
    }

    if (prayed && !isPrayerWindowOpen(prayer, date, now, madhabId)) {
      return fail(
        "This prayer’s on-time window has ended (or not started). Use Kaza after the end time."
      );
    }

    const sunnah = prayed ? Boolean(parsed.data.sunnah) : false;
    const tasbeeh = prayed ? Boolean(parsed.data.tasbeeh) : false;

    if (!prayed) {
      const existing = await NamazLog.findOne({
        userId: session.sub,
        date,
        prayer,
      });
      if (existing?.isKaza) {
        return fail("Kaza entries can only be managed from the Kaza section.");
      }
      if (existing && !isPrayerWindowOpen(prayer, date, now, madhabId)) {
        return fail("Cannot uncheck after the prayer window has ended.");
      }
      await NamazLog.findOneAndDelete({
        userId: session.sub,
        date,
        prayer,
      });
      const logs = await NamazLog.find({ userId: session.sub, date }).lean();
      const schedule = getNamazScheduleSnapshot(now, madhabId);
      return ok({
        ...buildDayStatus(date, mapLogs(logs), now, trackingStart, madhabId),
        madhabId,
        schedule,
      });
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
          sunnah,
          tasbeeh,
          prayedAt:
            existing?.prayedAt && !existing.isKaza
              ? existing.prayedAt
              : now,
          kazaAt: null,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const logs = await NamazLog.find({ userId: session.sub, date }).lean();
    const schedule = getNamazScheduleSnapshot(now, madhabId);
    return ok({
      ...buildDayStatus(date, mapLogs(logs), now, trackingStart, madhabId),
      madhabId,
      schedule,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
