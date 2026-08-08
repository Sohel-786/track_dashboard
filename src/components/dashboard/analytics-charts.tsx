"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { BAR_PALETTE } from "@/components/dashboard/chart-theme";

type KpiTheme = {
  gradient: string;
  border: string;
  shadow: string;
  iconBg: string;
};

export function AnalyticsKpiCard({
  label,
  sub,
  value,
  icon: Icon,
  theme,
}: {
  label: string;
  sub: string;
  value: string | number;
  icon: LucideIcon;
  theme: KpiTheme;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-gradient-to-br p-5 transition-shadow hover:shadow-xl",
        theme.gradient,
        theme.border,
        theme.shadow
      )}
    >
      <div
        className="pointer-events-none absolute -right-10 -bottom-10 h-36 w-36 rounded-full bg-white/10"
        aria-hidden
      />
      <div className="relative z-10 flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-2xl font-bold tabular-nums tracking-tight text-white drop-shadow-sm sm:text-3xl">
            {value}
          </p>
          <p className="text-sm font-semibold text-white/95">{label}</p>
          <p className="text-xs text-white/75">{sub}</p>
        </div>
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
            theme.iconBg
          )}
        >
          <Icon className="h-5 w-5 text-white" strokeWidth={2.25} />
        </div>
      </div>
    </div>
  );
}

export type ChartRow = { label: string; count: number; sub?: string };

export function HorizontalBarChart({
  title,
  rows,
  emptyLabel = "No data for selected filters",
}: {
  title: string;
  rows: ChartRow[];
  emptyLabel?: string;
}) {
  const max = Math.max(...rows.map((r) => r.count), 1);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-4 py-3 sm:px-5">
        <h3 className="text-sm font-bold tracking-tight">{title}</h3>
      </div>
      <div className="flex flex-col gap-3 p-4 sm:p-5">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {emptyLabel}
          </p>
        ) : (
          rows.map((row, i) => (
            <div
              key={`${row.label}-${i}`}
              className="grid grid-cols-1 gap-1.5 sm:grid-cols-[minmax(7rem,11rem)_1fr_auto] sm:items-center sm:gap-3"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold">{row.label}</p>
                {row.sub ? (
                  <p className="truncate text-[11px] text-muted-foreground">
                    {row.sub}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-3">
                <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      BAR_PALETTE[i % BAR_PALETTE.length]
                    )}
                    style={{
                      width: `${Math.max(
                        (row.count / max) * 100,
                        row.count > 0 ? 4 : 0
                      )}%`,
                    }}
                  />
                </div>
                <span className="min-w-[2rem] text-right text-sm font-bold tabular-nums sm:hidden">
                  {row.count}
                </span>
              </div>
              <span className="hidden min-w-[2rem] text-right text-sm font-bold tabular-nums sm:block">
                {row.count}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function TrendChartShell({
  title,
  children,
  chartHeight = 280,
  action,
}: {
  title: string;
  children: React.ReactNode;
  chartHeight?: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
        <h3 className="text-sm font-bold tracking-tight">{title}</h3>
        {action}
      </div>
      <div className="min-w-0 p-2 pt-3 sm:p-4" style={{ height: chartHeight }}>
        {children}
      </div>
    </div>
  );
}
