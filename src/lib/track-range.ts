import {
  isValidIsoDate,
  resolveAnalyticsQuickRange,
  type AnalyticsQuickRange,
} from "@/lib/date-ranges";

const QUICK_RANGES: AnalyticsQuickRange[] = [
  "today",
  "week",
  "month",
  "year",
  "last7",
  "last30",
  "custom",
];

export type ResolvedRange =
  | { ok: true; quick: AnalyticsQuickRange; from: string; to: string }
  | { ok: false; message: string };

/**
 * Shared `?range=&from=&to=` parsing for every map endpoint, clamped to the
 * account's first tracked day so the map never offers a window that predates
 * the account — the same rule the rest of the app follows.
 */
export function resolveTrackRange(
  searchParams: URLSearchParams,
  trackingStart: string,
  fallback: AnalyticsQuickRange = "last30"
): ResolvedRange {
  const quick = (searchParams.get("range") || fallback) as AnalyticsQuickRange;
  if (!QUICK_RANGES.includes(quick)) {
    return { ok: false, message: "Invalid range" };
  }

  const customFrom = searchParams.get("from") || undefined;
  const customTo = searchParams.get("to") || undefined;
  if (customFrom && !isValidIsoDate(customFrom)) {
    return { ok: false, message: "Invalid from date" };
  }
  if (customTo && !isValidIsoDate(customTo)) {
    return { ok: false, message: "Invalid to date" };
  }

  const { from, to } = resolveAnalyticsQuickRange(
    quick,
    customFrom,
    customTo,
    trackingStart
  );
  if (from > to) return { ok: false, message: "from must be before to" };

  return { ok: true, quick, from, to };
}
