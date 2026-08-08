import {
  resolveAnalyticsQuickRange,
  type AnalyticsQuickRange,
} from "@/lib/date-ranges";

/** True when analytics range differs from the default quick preset (usually today). */
export function hasActiveAnalyticsRangeFilter(
  quick: AnalyticsQuickRange,
  from: string,
  to: string,
  defaultQuick: AnalyticsQuickRange = "today"
): boolean {
  const baseline = resolveAnalyticsQuickRange(defaultQuick);
  return (
    quick !== defaultQuick || from !== baseline.from || to !== baseline.to
  );
}
