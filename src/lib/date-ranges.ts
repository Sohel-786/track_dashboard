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

/** Calendar day (YYYY-MM-DD) of an instant as seen in a given IANA time zone. */
export function isoDateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const bag: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") bag[p.type] = p.value;
  return `${bag.year}-${bag.month}-${bag.day}`;
}

/** No global floor configured — per-user start dates govern on their own. */
const NO_TRACKING_FLOOR = "1970-01-01";

/**
 * Deployment-wide earliest day TrackDash will ever count, from
 * NEXT_PUBLIC_TRACKING_START_DATE. This is only a **floor**: the day a given
 * account actually starts tracking is per-user and usually later — see
 * `getUserTrackingStart` in lib/user-settings.ts.
 *
 * Leaving it unset is fine and is the recommended default; each user then
 * starts from the day their account was created.
 */
export function getTrackingStartFloor(): string {
  const raw =
    process.env.NEXT_PUBLIC_TRACKING_START_DATE?.trim() ||
    process.env.TRACKING_START_DATE?.trim();

  const today = todayIso();
  if (raw && isValidIsoDate(raw)) {
    return raw > today ? today : raw;
  }
  return NO_TRACKING_FLOOR;
}

/**
 * @deprecated Server code must use `getUserTrackingStart(userId)`; client code
 * must read `trackingStart` from the API payload. Kept as the default for pure
 * helpers whose callers always pass an explicit value.
 */
export function getTrackingStartDate(): string {
  return getTrackingStartFloor();
}

/** Raise `from`/`to` so the window never precedes the tracking start. */
export function clampRangeToTrackingStart(
  from: string,
  to: string,
  start = getTrackingStartFloor()
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
  start = getTrackingStartFloor()
): boolean {
  return date < start;
}

export function trackingStartLabel(start = getTrackingStartFloor()): string {
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
  customTo?: string,
  start?: string
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

  return clampRangeToTrackingStart(from, to, start ?? getTrackingStartFloor());
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
