"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Target,
  TrendingUp,
} from "lucide-react";
import { api } from "@/lib/client-api";
import type { AnalyticsQuickRange } from "@/lib/date-ranges";
import { resolveAnalyticsQuickRange } from "@/lib/date-ranges";
import type { AnalyticsResponse, Category } from "@/types";
import {
  AnalyticsKpiCard,
  HorizontalBarChart,
  TrendChartShell,
} from "@/components/dashboard/analytics-charts";
import {
  CHART_GRID_STROKE,
  CHART_TICK,
  CHART_TOOLTIP_STYLE,
  KPI_THEMES,
  SERIES_COLORS,
} from "@/components/dashboard/chart-theme";
import { cn } from "@/lib/utils";
import {
  filterInputClass,
  filterLabelClass,
  listFilterCardClass,
} from "@/lib/ui-styles";

const AreaChart = dynamic(
  () => import("recharts").then((m) => m.AreaChart),
  { ssr: false }
);
const Area = dynamic(() => import("recharts").then((m) => m.Area), {
  ssr: false,
});
const XAxis = dynamic(() => import("recharts").then((m) => m.XAxis), {
  ssr: false,
});
const YAxis = dynamic(() => import("recharts").then((m) => m.YAxis), {
  ssr: false,
});
const CartesianGrid = dynamic(
  () => import("recharts").then((m) => m.CartesianGrid),
  { ssr: false }
);
const Tooltip = dynamic(() => import("recharts").then((m) => m.Tooltip), {
  ssr: false,
});
const ResponsiveContainer = dynamic(
  () => import("recharts").then((m) => m.ResponsiveContainer),
  { ssr: false }
);
const Legend = dynamic(() => import("recharts").then((m) => m.Legend), {
  ssr: false,
});
const Line = dynamic(() => import("recharts").then((m) => m.Line), {
  ssr: false,
});
const LineChart = dynamic(() => import("recharts").then((m) => m.LineChart), {
  ssr: false,
});
const ReferenceLine = dynamic(
  () => import("recharts").then((m) => m.ReferenceLine),
  { ssr: false }
);

const RANGE_PILLS: { key: AnalyticsQuickRange; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
  { key: "custom", label: "Custom" },
];

type Grain = "day" | "week" | "month";

export default function DashboardAnalytics() {
  const defaultRange = resolveAnalyticsQuickRange("month");
  const [quick, setQuick] = useState<AnalyticsQuickRange>("month");
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [grain, setGrain] = useState<Grain>("day");
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<Category[]>("/api/categories")
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          range: quick,
          from,
          to,
        });
        if (categoryId) params.set("categoryId", categoryId);
        const result = await api<AnalyticsResponse>(
          `/api/analytics?${params.toString()}`
        );
        if (!cancelled) setData(result);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load analytics");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [quick, from, to, categoryId]);

  function applyQuick(key: AnalyticsQuickRange) {
    setQuick(key);
    if (key !== "custom") {
      const range = resolveAnalyticsQuickRange(key);
      setFrom(range.from);
      setTo(range.to);
    }
  }

  const trend = useMemo(() => {
    if (!data) return [];
    return data.trends[grain] ?? [];
  }, [data, grain]);

  const progressiveChartData = useMemo(() => {
    if (!data?.progressiveByCategory?.length) return [];
    const seriesList = data.progressiveByCategory;
    const days = seriesList[0]?.series ?? [];
    return days.map((point, idx) => {
      const row: Record<string, string | number> = {
        period: point.period,
        periodStart: point.periodStart,
      };
      for (const cat of seriesList) {
        row[cat.name] = cat.series[idx]?.value ?? 0;
      }
      return row;
    });
  }, [data]);

  const selectedProgressive = useMemo(() => {
    if (!data) return null;
    if (categoryId) {
      return (
        data.progressiveByCategory.find((c) => c.categoryId === categoryId) ??
        null
      );
    }
    if (data.progressiveByCategory.length === 1) {
      return data.progressiveByCategory[0];
    }
    return null;
  }, [data, categoryId]);

  function resetFilters() {
    const range = resolveAnalyticsQuickRange("month");
    setQuick("month");
    setFrom(range.from);
    setTo(range.to);
    setCategoryId("");
  }

  return (
    <div className="space-y-6">
      <div className={listFilterCardClass}>
        <div className="flex flex-wrap gap-2 border-b border-border px-4 py-3">
          {RANGE_PILLS.map((pill) => (
            <button
              key={pill.key}
              type="button"
              onClick={() => applyQuick(pill.key)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                quick === pill.key
                  ? "bg-teal-600 text-white shadow-sm"
                  : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              )}
            >
              {pill.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className={filterLabelClass}>From</span>
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setQuick("custom");
                setFrom(e.target.value);
              }}
              className={filterInputClass}
            />
          </label>
          <label className="block">
            <span className={filterLabelClass}>To</span>
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setQuick("custom");
                setTo(e.target.value);
              }}
              className={filterInputClass}
            />
          </label>
          <label className="block sm:col-span-2 lg:col-span-1">
            <span className={filterLabelClass}>Category</span>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={filterInputClass}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-rose-200 bg-card px-3 text-xs font-bold text-rose-600 transition hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950/30"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Clear filters
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading analytics...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <AnalyticsKpiCard
              label="Today"
              sub="Sum of today's entries"
              value={data.kpis.todayTotal}
              icon={CalendarDays}
              theme={KPI_THEMES.today}
            />
            <AnalyticsKpiCard
              label="This Week"
              sub="Last 7 days"
              value={data.kpis.weekTotal}
              icon={TrendingUp}
              theme={KPI_THEMES.week}
            />
            <AnalyticsKpiCard
              label="This Month"
              sub="Month to date"
              value={data.kpis.monthTotal}
              icon={CalendarRange}
              theme={KPI_THEMES.month}
            />
            <AnalyticsKpiCard
              label="This Year"
              sub="Year to date"
              value={data.kpis.yearTotal}
              icon={Target}
              theme={KPI_THEMES.year}
            />
            <AnalyticsKpiCard
              label="Selected Range"
              sub={`${data.appliedRange.from} → ${data.appliedRange.to}`}
              value={data.kpis.rangeTotal}
              icon={TrendingUp}
              theme={KPI_THEMES.range}
            />
            <AnalyticsKpiCard
              label="Targets Hit Today"
              sub={`${data.kpis.categoriesHitTarget} of ${data.kpis.activeCategories} categories met daily target`}
              value={data.kpis.categoriesHitTarget}
              icon={CheckCircle2}
              theme={KPI_THEMES.target}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <TrendChartShell
              title="Entry trend"
              chartHeight={260}
              action={
                <select
                  value={grain}
                  onChange={(e) => setGrain(e.target.value as Grain)}
                  className="h-8 rounded-lg border border-border bg-background px-2 text-xs"
                >
                  <option value="day">Day</option>
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                </select>
              }
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend}>
                  <defs>
                    <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0d9488" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#0d9488" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
                  <XAxis
                    dataKey="period"
                    tick={CHART_TICK}
                    interval="preserveStartEnd"
                  />
                  <YAxis allowDecimals={false} tick={CHART_TICK} />
                  <Tooltip {...CHART_TOOLTIP_STYLE} />
                  <Area
                    type="monotone"
                    dataKey="value"
                    name="Total"
                    stroke="#0d9488"
                    strokeWidth={3}
                    fill="url(#trendFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </TrendChartShell>

            <HorizontalBarChart
              title="By category (avg daily vs daily target)"
              rows={data.byCategory.map((c) => ({
                label: c.name,
                count: Math.round(c.avgDaily),
                sub: `Daily target ${c.target} · avg ${c.avgDaily} · hit ${c.daysHit}/${c.daysTracked || 0} days`,
              }))}
              emptyLabel="No entries in this range. Add categories and log daily values."
            />
          </div>

          <TrendChartShell
            title={
              selectedProgressive
                ? `Daily total · ${selectedProgressive.name} (daily target ${selectedProgressive.target})`
                : "Daily totals by category (vs daily target)"
            }
            chartHeight={320}
          >
            <ResponsiveContainer width="100%" height="100%">
              {selectedProgressive ? (
                <AreaChart data={selectedProgressive.series}>
                  <defs>
                    <linearGradient id="progFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
                  <XAxis
                    dataKey="period"
                    tick={CHART_TICK}
                    interval="preserveStartEnd"
                  />
                  <YAxis allowDecimals={false} tick={CHART_TICK} />
                  <Tooltip {...CHART_TOOLTIP_STYLE} />
                  <ReferenceLine
                    y={selectedProgressive.target}
                    stroke="#f59e0b"
                    strokeDasharray="4 4"
                    label={{
                      value: "Target",
                      fill: "hsl(var(--muted-foreground))",
                      fontSize: 11,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    name="Day total"
                    stroke="#8b5cf6"
                    strokeWidth={3}
                    fill="url(#progFill)"
                  />
                </AreaChart>
              ) : (
                <LineChart data={progressiveChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
                  <XAxis
                    dataKey="period"
                    tick={CHART_TICK}
                    interval="preserveStartEnd"
                  />
                  <YAxis allowDecimals={false} tick={CHART_TICK} />
                  <Tooltip {...CHART_TOOLTIP_STYLE} />
                  <Legend />
                  {(data.progressiveByCategory || []).map((cat, i) => (
                    <Line
                      key={cat.categoryId}
                      type="monotone"
                      dataKey={cat.name}
                      stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                      strokeWidth={2.5}
                      dot={false}
                    />
                  ))}
                </LineChart>
              )}
            </ResponsiveContainer>
          </TrendChartShell>
        </>
      ) : null}
    </div>
  );
}
