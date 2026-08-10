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

export function todayIso(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export function isValidIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * First calendar day TrackDash should count for analytics / namaz misses.
 * Set NEXT_PUBLIC_TRACKING_START_DATE (YYYY-MM-DD) at go-live.
 */
export function getTrackingStartDate(): string {
  const raw =
    process.env.NEXT_PUBLIC_TRACKING_START_DATE?.trim() ||
    process.env.TRACKING_START_DATE?.trim();

  const today = todayIso();
  if (raw && isValidIsoDate(raw)) {
    return raw > today ? today : raw;
  }
  return "2020-01-01";
}

/** Raise `from`/`to` so the window never precedes go-live. */
export function clampRangeToTrackingStart(
  from: string,
  to: string,
  start = getTrackingStartDate()
): { from: string; to: string } {
  let nextFrom = from;
  let nextTo = to;
  if (nextFrom < start) nextFrom = start;
  if (nextTo < start) nextTo = start;
  if (nextFrom > nextTo) nextFrom = nextTo;
  return { from: nextFrom, to: nextTo };
}

export function isBeforeTrackingStart(
  date: string,
  start = getTrackingStartDate()
): boolean {
  return date < start;
}

export function trackingStartLabel(start = getTrackingStartDate()): string {
  try {
    return format(new Date(`${start}T00:00:00`), "dd MMM yyyy");
  } catch {
    return start;
  }
}

/**
 * Resolve a quick/custom range, then clamp so it never starts before go-live.
 */
export function resolveAnalyticsQuickRange(
  key: AnalyticsQuickRange,
  customFrom?: string,
  customTo?: string
): { from: string; to: string } {
  const today = new Date();
  const fmt = (d: Date) => format(d, "yyyy-MM-dd");

  let from: string;
  let to: string;

  switch (key) {
    case "today":
      from = fmt(today);
      to = fmt(today);
      break;
    case "week":
    case "last7":
      from = fmt(subDays(today, 6));
      to = fmt(today);
      break;
    case "month":
    case "last30":
      from = fmt(startOfMonth(today));
      to = fmt(today);
      break;
    case "year":
      from = fmt(startOfYear(today));
      to = fmt(today);
      break;
    case "custom":
      from = customFrom || fmt(subMonths(today, 1));
      to = customTo || fmt(today);
      break;
    default:
      from = fmt(startOfMonth(today));
      to = fmt(today);
  }

  return clampRangeToTrackingStart(from, to);
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
