"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";
import {
  resolveAnalyticsQuickRange,
  type AnalyticsQuickRange,
} from "@/lib/date-ranges";
import { NAMAZ_LOCATION_BASE } from "@/lib/prayer-times";

/** Every timestamp on the map is shown in the same zone the prayer day uses. */
const TZ = NAMAZ_LOCATION_BASE.timeZone;

export function formatClock(iso: string | null | undefined): string {
  if (!iso) return "—";
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(value);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: TZ,
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(value);
}

export function formatDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  const value = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(value.getTime())) return iso;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(value);
}

export const RANGE_PILLS: Array<{ key: AnalyticsQuickRange; label: string }> = [
  { key: "week", label: "7 days" },
  { key: "month", label: "This month" },
  { key: "last30", label: "30 days" },
  { key: "year", label: "This year" },
  { key: "custom", label: "Custom" },
];

export type RangeValue = {
  quick: AnalyticsQuickRange;
  from: string;
  to: string;
};

export function defaultRange(
  quick: AnalyticsQuickRange = "week"
): RangeValue {
  const resolved = resolveAnalyticsQuickRange(quick);
  return { quick, from: resolved.from, to: resolved.to };
}

/** The when-filter shared by Journeys, Places and Masjids. */
export function RangeBar({
  value,
  onChange,
  trackingStart,
  children,
}: {
  value: RangeValue;
  onChange: (next: RangeValue) => void;
  trackingStart?: string | null;
  children?: React.ReactNode;
}) {
  function applyQuick(quick: AnalyticsQuickRange) {
    if (quick === "custom") {
      onChange({ ...value, quick });
      return;
    }
    const resolved = resolveAnalyticsQuickRange(quick);
    onChange({ quick, from: resolved.from, to: resolved.to });
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:p-4">
      <div className="flex flex-wrap items-center gap-1 rounded-xl bg-muted p-1">
        {RANGE_PILLS.map((pill) => (
          <button
            key={pill.key}
            type="button"
            onClick={() => applyQuick(pill.key)}
            aria-pressed={value.quick === pill.key}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-bold transition sm:text-sm",
              value.quick === pill.key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {pill.label}
          </button>
        ))}
      </div>

      {value.quick === "custom" ? (
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="min-w-[9rem] flex-1 sm:max-w-[11rem]">
            <DatePicker
              value={value.from}
              minIso={trackingStart ?? undefined}
              maxIso={value.to}
              onChange={(iso) => iso && onChange({ ...value, from: iso })}
            />
          </div>
          <div className="min-w-[9rem] flex-1 sm:max-w-[11rem]">
            <DatePicker
              value={value.to}
              minIso={value.from}
              onChange={(iso) => iso && onChange({ ...value, to: iso })}
            />
          </div>
        </div>
      ) : null}

      {children ? (
        <div className="w-full sm:ml-auto sm:w-auto">{children}</div>
      ) : null}
    </div>
  );
}

/** Horizontal bar chart row — same shape the Namaz insights already use. */
export function BarRow({
  label,
  detail,
  value,
  max,
  color,
}: {
  label: string;
  detail: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <li className="flex items-center gap-3">
      <span className="w-28 shrink-0 truncate text-xs font-semibold sm:w-40">
        {label}
      </span>
      <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full transition-all duration-500"
          style={{
            width: `${Math.max(value > 0 ? 3 : 0, pct)}%`,
            background: color,
          }}
        />
      </span>
      <span className="w-24 shrink-0 text-right text-xs font-bold tabular-nums">
        {detail}
      </span>
    </li>
  );
}

/** Coloured chip for a place kind, used in every list on the map screen. */
export function KindBadge({
  kind,
  className,
}: {
  kind: "masjid" | "place" | "unknown";
  className?: string;
}) {
  const tone =
    kind === "masjid"
      ? "bg-teal-500/15 text-teal-800 dark:bg-teal-400/15 dark:text-teal-200"
      : kind === "place"
        ? "bg-indigo-500/15 text-indigo-800 dark:bg-indigo-400/15 dark:text-indigo-200"
        : "bg-muted text-muted-foreground";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        tone,
        className
      )}
    >
      {kind === "masjid" ? "Masjid" : kind === "place" ? "Place" : "Unnamed"}
    </span>
  );
}

/** Sparkline-ish daily distance bars for the journeys header. */
export function DistanceBars({
  days,
}: {
  days: Array<{ date: string; dayLabel: string; distanceMeters: number }>;
}) {
  const max = useMemo(
    () => Math.max(1, ...days.map((day) => day.distanceMeters)),
    [days]
  );

  if (days.length === 0) return null;

  return (
    <div
      className="flex h-24 items-end gap-[3px] overflow-x-auto"
      role="img"
      aria-label="Daily distance"
    >
      {days.map((day) => (
        <span
          key={day.date}
          title={`${day.dayLabel} · ${(day.distanceMeters / 1000).toFixed(2)} km`}
          className="min-w-[6px] flex-1 rounded-t bg-teal-600 transition-all dark:bg-teal-400"
          style={{
            height: `${Math.max(day.distanceMeters > 0 ? 4 : 1, (day.distanceMeters / max) * 100)}%`,
            opacity: day.distanceMeters > 0 ? 1 : 0.25,
          }}
        />
      ))}
    </div>
  );
}
