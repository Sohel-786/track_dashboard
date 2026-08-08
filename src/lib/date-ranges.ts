import {
  endOfMonth,
  format,
  startOfMonth,
  startOfYear,
  subDays,
  subMonths,
} from "date-fns";

export type AnalyticsQuickRange =
  | "today"
  | "week"
  | "month"
  | "year"
  | "last7"
  | "last30"
  | "custom";

export function resolveAnalyticsQuickRange(
  key: AnalyticsQuickRange,
  customFrom?: string,
  customTo?: string
): { from: string; to: string } {
  const today = new Date();
  const fmt = (d: Date) => format(d, "yyyy-MM-dd");

  switch (key) {
    case "today":
      return { from: fmt(today), to: fmt(today) };
    case "week":
    case "last7":
      return { from: fmt(subDays(today, 6)), to: fmt(today) };
    case "month":
    case "last30":
      return { from: fmt(startOfMonth(today)), to: fmt(today) };
    case "year":
      return { from: fmt(startOfYear(today)), to: fmt(today) };
    case "custom":
      return {
        from: customFrom || fmt(subMonths(today, 1)),
        to: customTo || fmt(today),
      };
    default:
      return { from: fmt(startOfMonth(today)), to: fmt(today) };
  }
}

export function todayIso(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export function isValidIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Inclusive day range as ISO strings. */
export function eachDayIso(from: string, to: string): string[] {
  const days: string[] = [];
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return days;
  }
  const cursor = new Date(start);
  while (cursor <= end) {
    days.push(format(cursor, "yyyy-MM-dd"));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export { endOfMonth, format, startOfMonth, startOfYear, subDays, subMonths };
