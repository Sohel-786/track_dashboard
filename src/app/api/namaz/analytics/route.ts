import { NextRequest } from "next/server";
import connectDB from "@/lib/mongodb";
import NamazLog from "@/models/NamazLog";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { fail, ok } from "@/lib/api-helpers";
import {
  isValidIsoDate,
  resolveAnalyticsQuickRange,
  type AnalyticsQuickRange,
} from "@/lib/date-ranges";
import { buildNamazAnalytics } from "@/lib/namaz-analytics";
import { getUserNamazMadhab } from "@/lib/namaz-user";

const QUICK_RANGES: AnalyticsQuickRange[] = [
  "today",
  "week",
  "month",
  "year",
  "last7",
  "last30",
  "custom",
];

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    await connectDB();

    const { searchParams } = request.nextUrl;
    const quick = (searchParams.get("range") || "month") as AnalyticsQuickRange;
    if (!QUICK_RANGES.includes(quick)) return fail("Invalid range");

    const customFrom = searchParams.get("from") || undefined;
    const customTo = searchParams.get("to") || undefined;
    if (customFrom && !isValidIsoDate(customFrom)) return fail("Invalid from date");
    if (customTo && !isValidIsoDate(customTo)) return fail("Invalid to date");

    const { from, to } = resolveAnalyticsQuickRange(quick, customFrom, customTo);
    if (from > to) return fail("from must be before to");

    const madhabId = await getUserNamazMadhab(session.sub);

    const logs = await NamazLog.find({
      userId: session.sub,
      date: { $gte: from, $lte: to },
    }).lean();

    // Streak needs history before `from` — load extra lookback.
    const streakLogs = await NamazLog.find({
      userId: session.sub,
      prayed: true,
      date: { $lte: to },
    })
      .sort({ date: -1 })
      .limit(5 * 400)
      .lean();

    const analytics = buildNamazAnalytics({
      from,
      to,
      now: new Date(),
      madhabId,
      logs: logs.map((l) => ({
        date: l.date,
        prayer: l.prayer,
        prayed: l.prayed,
        sunnah: l.sunnah,
        tasbeeh: l.tasbeeh,
        isKaza: Boolean(l.isKaza),
        prayedAt: l.prayedAt,
        kazaAt: l.kazaAt,
      })),
    });

    // Recompute streak with wider history
    const withHistory = buildNamazAnalytics({
      from,
      to,
      now: new Date(),
      madhabId,
      logs: streakLogs.map((l) => ({
        date: l.date,
        prayer: l.prayer,
        prayed: l.prayed,
        sunnah: l.sunnah,
        tasbeeh: l.tasbeeh,
        isKaza: Boolean(l.isKaza),
        prayedAt: l.prayedAt,
        kazaAt: l.kazaAt,
      })),
    });

    return ok({
      appliedRange: { quick, from, to },
      madhabId,
      ...analytics,
      kpis: {
        ...analytics.kpis,
        streak: withHistory.kpis.streak,
      },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
