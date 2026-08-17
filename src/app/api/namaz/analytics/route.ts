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
import { isNamazPrayer } from "@/lib/namaz";
import { buildNamazAnalytics } from "@/lib/namaz-analytics";
import { getUserSettings } from "@/lib/user-settings";

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

    const prayerParam = searchParams.get("prayer") || "";
    const prayerFilter = isNamazPrayer(prayerParam) ? prayerParam : null;

    const { madhabId, trackingStart } = await getUserSettings(session.sub);

    // Clamp to the account's own start so a fresh install never reports days
    // from before the user existed as missed prayers.
    const { from, to } = resolveAnalyticsQuickRange(
      quick,
      customFrom,
      customTo,
      trackingStart
    );
    if (from > to) return fail("from must be before to");

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

    const mapLog = (l: {
      date: string;
      prayer: string;
      prayed: boolean;
      sunnah: boolean;
      tasbeeh: boolean;
      zamaat?: boolean;
      isKaza?: boolean;
      prayedAt?: Date | null;
      kazaAt?: Date | null;
    }) => ({
      date: l.date,
      prayer: l.prayer,
      prayed: l.prayed,
      sunnah: l.sunnah,
      tasbeeh: l.tasbeeh,
      zamaat: Boolean(l.zamaat),
      isKaza: Boolean(l.isKaza),
      prayedAt: l.prayedAt,
      kazaAt: l.kazaAt,
    });

    const analytics = buildNamazAnalytics({
      from,
      to,
      now: new Date(),
      trackingStart,
      madhabId,
      prayerFilter,
      logs: logs.map(mapLog),
    });

    const withHistory = buildNamazAnalytics({
      from,
      to,
      now: new Date(),
      trackingStart,
      madhabId,
      prayerFilter,
      logs: streakLogs.map(mapLog),
    });

    return ok({
      appliedRange: { quick, from, to },
      madhabId,
      ...analytics,
      trackingStart,
      kpis: {
        ...analytics.kpis,
        streak: withHistory.kpis.streak,
        bestStreak: Math.max(
          analytics.kpis.bestStreak,
          withHistory.kpis.bestStreak
        ),
      },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
