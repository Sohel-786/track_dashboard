"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  STAT_ACCENTS,
  type StatAccentKey,
} from "@/components/dashboard/chart-theme";

/* ------------------------------------------------------------------ tiles */

export type StatDelta = {
  /** Percentage change vs the comparison period. */
  pct: number;
  label: string;
  /** When false a rise is bad (e.g. missed prayers). */
  higherIsBetter?: boolean;
};

/**
 * One headline number. Neutral surface + a single accent so a row of tiles
 * reads as one system and the values stay the loudest element.
 */
export function StatTile({
  label,
  value,
  sub,
  icon: Icon,
  accent = "teal",
  progress,
  delta,
  footer,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: LucideIcon;
  accent?: StatAccentKey;
  /** 0–100; renders a thin meter under the value. */
  progress?: number;
  delta?: StatDelta;
  footer?: ReactNode;
}) {
  const tone = STAT_ACCENTS[accent];

  return (
    <div className="relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:shadow-md">
      <span
        className={cn("absolute inset-y-0 left-0 w-1", tone.rail)}
        aria-hidden
      />
      <div className="flex items-start justify-between gap-3 pl-1.5">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {Icon ? (
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
              tone.chip
            )}
          >
            <Icon className="h-4 w-4" strokeWidth={2.25} />
          </span>
        ) : null}
      </div>

      <div className="mt-1.5 flex flex-wrap items-baseline gap-2 pl-1.5">
        <p className="text-2xl font-bold tabular-nums tracking-tight sm:text-3xl">
          {value}
        </p>
        {delta ? <DeltaChip {...delta} /> : null}
      </div>

      {sub ? (
        <p className="mt-1 pl-1.5 text-xs text-muted-foreground">{sub}</p>
      ) : null}

      {progress !== undefined ? (
        <div className="mt-3 pl-1.5">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-all", tone.bar)}
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        </div>
      ) : null}

      {footer ? <div className="mt-3 pl-1.5">{footer}</div> : null}
    </div>
  );
}

function DeltaChip({ pct, label, higherIsBetter = true }: StatDelta) {
  const flat = Math.abs(pct) < 0.05;
  const good = flat ? null : higherIsBetter ? pct > 0 : pct < 0;
  const Icon = flat ? ArrowRight : pct > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      title={label}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
        good === null && "bg-muted text-muted-foreground",
        good === true &&
          "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
        good === false && "bg-rose-500/12 text-rose-700 dark:text-rose-300"
      )}
    >
      <Icon className="h-3 w-3" />
      {flat ? "0%" : `${Math.abs(Math.round(pct * 10) / 10)}%`}
    </span>
  );
}

/* ------------------------------------------------------------------- ring */

/** Single-value completion ring — clearer than a one-slice donut. */
export function ProgressRing({
  value,
  label,
  caption,
  size = 132,
  stroke = 12,
  color = "#14b8a6",
}: {
  /** 0–100. */
  value: number;
  label?: string;
  caption?: string;
  size?: number;
  stroke?: number;
  color?: string;
}) {
  const clamped = Math.min(100, Math.max(0, value));
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const dash = (clamped / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={`${label ?? "Progress"}: ${clamped}%`}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference - dash}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: "stroke-dasharray 600ms ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tabular-nums tracking-tight">
            {Math.round(clamped * 10) / 10}%
          </span>
          {label ? (
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {label}
            </span>
          ) : null}
        </div>
      </div>
      {caption ? (
        <p className="max-w-[14rem] text-center text-[11px] text-muted-foreground">
          {caption}
        </p>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------- heatmap */

export type HeatmapDay = {
  date: string;
  /** 0–1 intensity. Negative marks "no data / future". */
  intensity: number;
  title: string;
};

const HEAT_STEPS = [
  "bg-muted",
  "bg-teal-500/25",
  "bg-teal-500/45",
  "bg-teal-500/65",
  "bg-teal-500/85",
  "bg-teal-600",
] as const;

function heatClass(intensity: number) {
  if (intensity < 0) return "bg-transparent border border-dashed border-border";
  if (intensity <= 0) return HEAT_STEPS[0];
  const step = Math.min(
    HEAT_STEPS.length - 1,
    Math.max(1, Math.ceil(intensity * (HEAT_STEPS.length - 1)))
  );
  return HEAT_STEPS[step];
}

/**
 * Calendar-style consistency grid: one square per day, columns are weeks and
 * rows are weekdays, so streaks and weak weekdays are visible at a glance.
 */
export function ConsistencyHeatmap({
  days,
  title,
  legendLow = "None",
  legendHigh = "All",
}: {
  days: HeatmapDay[];
  title?: string;
  legendLow?: string;
  legendHigh?: string;
}) {
  if (days.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No days in this range.
      </p>
    );
  }

  // Pad the first week so every column is a real Sun→Sat week.
  const firstDow = new Date(`${days[0].date}T00:00:00`).getDay();
  const cells: (HeatmapDay | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...days,
  ];

  const weeks: (HeatmapDay | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <div className="space-y-2">
      {title ? (
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {title}
        </p>
      ) : null}
      <div className="overflow-x-auto pb-1">
        <div className="flex gap-1">
          <div className="mr-1 flex shrink-0 flex-col gap-1 pt-[1px]">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <span
                key={`${d}-${i}`}
                className="flex h-3.5 items-center text-[9px] font-semibold leading-none text-muted-foreground"
              >
                {i % 2 === 1 ? d : ""}
              </span>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} className="flex shrink-0 flex-col gap-1">
              {Array.from({ length: 7 }, (_, di) => {
                const cell = week[di];
                if (!cell) {
                  return (
                    <span
                      key={di}
                      className="h-3.5 w-3.5 rounded-[3px]"
                      aria-hidden
                    />
                  );
                }
                return (
                  <span
                    key={cell.date}
                    title={cell.title}
                    className={cn(
                      "h-3.5 w-3.5 rounded-[3px] transition-colors",
                      heatClass(cell.intensity)
                    )}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
        <span>{legendLow}</span>
        {HEAT_STEPS.map((step) => (
          <span key={step} className={cn("h-3 w-3 rounded-[3px]", step)} />
        ))}
        <span>{legendHigh}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ rate bars */

export type RateRow = {
  label: string;
  /** 0–100. */
  pct: number;
  caption?: string;
  color?: string;
};

/** Compact "% of target" bars — better than a bar chart for 3–8 named rows. */
export function RateBars({
  rows,
  emptyLabel = "No data in this range",
}: {
  rows: RateRow[];
  emptyLabel?: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[6.5rem_1fr_3.25rem] items-center gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold">{row.label}</p>
            {row.caption ? (
              <p className="truncate text-[10px] text-muted-foreground">
                {row.caption}
              </p>
            ) : null}
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, Math.max(row.pct > 0 ? 3 : 0, row.pct))}%`,
                background: row.color ?? "#14b8a6",
              }}
            />
          </div>
          <span className="text-right text-xs font-bold tabular-nums">
            {Math.round(row.pct * 10) / 10}%
          </span>
        </div>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- shells */

export function SectionCard({
  title,
  description,
  action,
  children,
  bodyClassName,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h3 className="text-sm font-bold tracking-tight">{title}</h3>
          {description ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {action}
      </header>
      <div className={cn("min-w-0 p-4 sm:p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Section shell sized for a Recharts `ResponsiveContainer`. */
export function ChartCard({
  title,
  description,
  action,
  height = 280,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  height?: number;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h3 className="text-sm font-bold tracking-tight">{title}</h3>
          {description ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {action}
      </header>
      <div className="min-w-0 p-2 pt-3 sm:p-4" style={{ height }}>
        {children}
      </div>
    </section>
  );
}

export function ChartLegend({
  items,
}: {
  items: Array<{ label: string; color: string }>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-sm"
            style={{ background: item.color }}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-12 text-center">
      {Icon ? (
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="h-5 w-5" />
        </div>
      ) : null}
      <p className="mt-3 text-base font-bold text-foreground">{title}</p>
      {description ? (
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
