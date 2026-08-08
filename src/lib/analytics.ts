import {
  eachDayIso,
  format,
  getTrackingStartDate,
  startOfMonth,
  startOfYear,
  subDays,
} from "@/lib/date-ranges";
import type { ICategory } from "@/models/Category";
import type { IEntry } from "@/models/Entry";

export type TrendPoint = {
  period: string;
  periodStart: string;
  value: number;
  target?: number;
};

export type CategoryProgress = {
  categoryId: string;
  name: string;
  /** Daily target. */
  target: number;
  /** Sum of all entry values in the selected range. */
  total: number;
  /** Average daily total across days that have entries (or all days in range for today view). */
  avgDaily: number;
  /** % of days in range where day sum >= daily target. */
  daysHitPct: number;
  daysHit: number;
  daysTracked: number;
  entryCount: number;
  /** avgDaily / target * 100 (can exceed 100). */
  progress: number;
};

export type AnalyticsKpis = {
  todayTotal: number;
  weekTotal: number;
  monthTotal: number;
  yearTotal: number;
  rangeTotal: number;
  entryCount: number;
  activeCategories: number;
  /** Categories that met/exceeded today's daily target. */
  categoriesHitTarget: number;
  /** (category, day) pairs in range that met daily target. */
  dayTargetsHit: number;
};

function startOfWeekSunday(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - copy.getDay());
  return copy;
}

/** Sum of entry values grouped by categoryId + date. */
export function dayTotalsByCategory(
  entries: { categoryId: unknown; date: string; value: number }[]
): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of entries) {
    const key = `${String(e.categoryId)}|${e.date}`;
    map.set(key, (map.get(key) ?? 0) + e.value);
  }
  return map;
}

export function buildTrend(
  entries: Pick<IEntry, "date" | "value">[],
  from: string,
  to: string,
  granularity: "day" | "week" | "month"
): TrendPoint[] {
  const buckets = new Map<string, { period: string; value: number }>();

  const ensureBucket = (periodStart: string, period: string) => {
    if (!buckets.has(periodStart)) {
      buckets.set(periodStart, { period, value: 0 });
    }
  };

  if (granularity === "day") {
    for (const day of eachDayIso(from, to)) {
      ensureBucket(day, format(new Date(`${day}T00:00:00`), "dd MMM"));
    }
  } else if (granularity === "week") {
    const start = startOfWeekSunday(new Date(`${from}T00:00:00`));
    const end = new Date(`${to}T00:00:00`);
    const cursor = new Date(start);
    while (cursor <= end) {
      const key = format(cursor, "yyyy-MM-dd");
      ensureBucket(key, `W ${format(cursor, "dd MMM")}`);
      cursor.setDate(cursor.getDate() + 7);
    }
  } else {
    const start = startOfMonth(new Date(`${from}T00:00:00`));
    const end = new Date(`${to}T00:00:00`);
    const cursor = new Date(start);
    while (cursor <= end) {
      const key = format(cursor, "yyyy-MM-01");
      ensureBucket(key, format(cursor, "MMM yyyy"));
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  for (const entry of entries) {
    const d = new Date(`${entry.date}T00:00:00`);
    if (Number.isNaN(d.getTime())) continue;

    let key: string;
    if (granularity === "day") {
      key = entry.date;
    } else if (granularity === "week") {
      key = format(startOfWeekSunday(d), "yyyy-MM-dd");
    } else {
      key = format(startOfMonth(d), "yyyy-MM-01");
    }

    const bucket = buckets.get(key);
    if (bucket) bucket.value += entry.value;
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([periodStart, { period, value }]) => ({
      period,
      periodStart,
      value,
    }));
}

/**
 * Category progress against **daily** targets over a date range.
 * Progress uses average daily logged amount vs the daily target.
 */
export function buildCategoryProgress(
  categories: Pick<ICategory, "_id" | "name" | "target">[],
  entries: Pick<IEntry, "categoryId" | "value" | "date">[],
  from: string,
  to: string
): CategoryProgress[] {
  const days = eachDayIso(from, to);
  const dayMap = dayTotalsByCategory(entries);

  return categories
    .map((cat) => {
      const id = String(cat._id);
      let total = 0;
      let entryCount = 0;
      let daysTracked = 0;
      let daysHit = 0;

      for (const e of entries) {
        if (String(e.categoryId) !== id) continue;
        total += e.value;
        entryCount += 1;
      }

      for (const day of days) {
        const dayTotal = dayMap.get(`${id}|${day}`) ?? 0;
        if (dayTotal > 0) daysTracked += 1;
        if (dayTotal >= cat.target) daysHit += 1;
      }

      const avgDaily =
        daysTracked > 0
          ? Math.round((total / daysTracked) * 10) / 10
          : 0;
      const progress =
        cat.target > 0
          ? Math.round((avgDaily / cat.target) * 1000) / 10
          : 0;
      const daysHitPct =
        days.length > 0
          ? Math.round((daysHit / days.length) * 1000) / 10
          : 0;

      return {
        categoryId: id,
        name: cat.name,
        target: cat.target,
        total,
        avgDaily,
        daysHit,
        daysTracked,
        daysHitPct,
        entryCount,
        progress,
      };
    })
    .sort((a, b) => b.total - a.total);
}

export function computeKpis(
  allUserEntries: Pick<IEntry, "date" | "value" | "categoryId">[],
  rangeEntries: Pick<IEntry, "date" | "value" | "categoryId">[],
  categories: Pick<ICategory, "_id" | "name" | "target">[],
  today: string,
  rangeFrom: string,
  rangeTo: string
): AnalyticsKpis {
  const trackingStart = getTrackingStartDate();
  const clampFrom = (from: string) =>
    from < trackingStart ? trackingStart : from;

  const weekFrom = clampFrom(
    format(subDays(new Date(`${today}T00:00:00`), 6), "yyyy-MM-dd")
  );
  const monthFrom = clampFrom(
    format(startOfMonth(new Date(`${today}T00:00:00`)), "yyyy-MM-dd")
  );
  const yearFrom = clampFrom(
    format(startOfYear(new Date(`${today}T00:00:00`)), "yyyy-MM-dd")
  );

  const sumInRange = (from: string, to: string) =>
    allUserEntries
      .filter((e) => e.date >= from && e.date <= to)
      .reduce((acc, e) => acc + e.value, 0);

  const todayMap = dayTotalsByCategory(
    allUserEntries.filter((e) => e.date === today)
  );
  const categoriesHitTarget = categories.filter((cat) => {
    const dayTotal = todayMap.get(`${String(cat._id)}|${today}`) ?? 0;
    return dayTotal >= cat.target;
  }).length;

  const rangeDayMap = dayTotalsByCategory(rangeEntries);
  let dayTargetsHit = 0;
  for (const day of eachDayIso(rangeFrom, rangeTo)) {
    for (const cat of categories) {
      const dayTotal = rangeDayMap.get(`${String(cat._id)}|${day}`) ?? 0;
      if (dayTotal >= cat.target) dayTargetsHit += 1;
    }
  }

  return {
    todayTotal: sumInRange(today, today),
    weekTotal: sumInRange(weekFrom, today),
    monthTotal: sumInRange(monthFrom, today),
    yearTotal: sumInRange(yearFrom, today),
    rangeTotal: rangeEntries.reduce((acc, e) => acc + e.value, 0),
    entryCount: rangeEntries.length,
    activeCategories: categories.length,
    categoriesHitTarget,
    dayTargetsHit,
  };
}

/**
 * Daily totals for a category (not cumulative) — plotted against the daily target.
 */
export function buildCategoryDailySeries(
  category: Pick<ICategory, "_id" | "name" | "target">,
  entries: Pick<IEntry, "date" | "value" | "categoryId">[],
  from: string,
  to: string
): TrendPoint[] {
  const id = String(category._id);
  const byDay = new Map<string, number>();
  for (const e of entries) {
    if (String(e.categoryId) !== id) continue;
    byDay.set(e.date, (byDay.get(e.date) ?? 0) + e.value);
  }

  return eachDayIso(from, to).map((day) => ({
    period: format(new Date(`${day}T00:00:00`), "dd MMM"),
    periodStart: day,
    value: byDay.get(day) ?? 0,
    target: category.target,
  }));
}
