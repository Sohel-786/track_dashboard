import { NextRequest } from "next/server";
import connectDB from "@/lib/mongodb";
import Category from "@/models/Category";
import Entry from "@/models/Entry";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { fail, isObjectId, ok } from "@/lib/api-helpers";
import {
  isValidIsoDate,
  resolveAnalyticsQuickRange,
  todayIso,
  type AnalyticsQuickRange,
} from "@/lib/date-ranges";
import {
  buildCategoryDailySeries,
  buildCategoryProgress,
  buildTrend,
  computeKpis,
} from "@/lib/analytics";

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
    if (!QUICK_RANGES.includes(quick)) {
      return fail("Invalid range");
    }

    const customFrom = searchParams.get("from") || undefined;
    const customTo = searchParams.get("to") || undefined;
    if (customFrom && !isValidIsoDate(customFrom)) return fail("Invalid from date");
    if (customTo && !isValidIsoDate(customTo)) return fail("Invalid to date");

    const { from, to } = resolveAnalyticsQuickRange(quick, customFrom, customTo);
    if (from > to) return fail("from must be before to");

    const categoryId = searchParams.get("categoryId");
    if (categoryId && !isObjectId(categoryId)) {
      return fail("Invalid category id");
    }

    const categories = await Category.find({
      userId: session.sub,
      isActive: true,
      ...(categoryId ? { _id: categoryId } : {}),
    })
      .sort({ name: 1 })
      .lean();

    const categoryIds = categories.map((c) => c._id);

    const [rangeEntries, yearEntries] = await Promise.all([
      Entry.find({
        userId: session.sub,
        categoryId: { $in: categoryIds },
        date: { $gte: from, $lte: to },
      }).lean(),
      Entry.find({
        userId: session.sub,
        categoryId: { $in: categoryIds },
        date: {
          $gte: resolveAnalyticsQuickRange("year").from,
          $lte: todayIso(),
        },
      }).lean(),
    ]);

    const today = todayIso();
    const kpis = computeKpis(
      yearEntries,
      rangeEntries,
      categories,
      today,
      from,
      to
    );
    const byCategory = buildCategoryProgress(categories, rangeEntries, from, to);
    const trendDay = buildTrend(rangeEntries, from, to, "day");
    const trendWeek = buildTrend(rangeEntries, from, to, "week");
    const trendMonth = buildTrend(rangeEntries, from, to, "month");

    const progressiveByCategory = categories.map((cat) => ({
      categoryId: String(cat._id),
      name: cat.name,
      target: cat.target,
      series: buildCategoryDailySeries(cat, rangeEntries, from, to),
    }));

    return ok({
      appliedRange: { quick, from, to },
      kpis,
      byCategory,
      trends: {
        day: trendDay,
        week: trendWeek,
        month: trendMonth,
      },
      progressiveByCategory,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
