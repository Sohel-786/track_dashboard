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
import {
  getTrackingStartDate,
  resolveAnalyticsQuickRange,
  trackingStartLabel,
  type AnalyticsQuickRange,
} from "@/lib/date-ranges";
import type { AnalyticsResponse, Category, TrendPoint } from "@/types";
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
const ReferenceLine = dynamic(
  () => import("recharts").then((m) => m.ReferenceLine),
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
const BarChart = dynamic(() => import("recharts").then((m) => m.BarChart), {
  ssr: false,
});
const Bar = dynamic(() => import("recharts").then((m) => m.Bar), { ssr: false });
const Cell = dynamic(() => import("recharts").then((m) => m.Cell), {
  ssr: false,
});

const TARGET_BAR = {
  below: "#e11d48",
  exact: "#0d9488",
  exceed: "#7c3aed",
} as const;

function targetBarColor(value: number, target: number) {
  if (value > target) return TARGET_BAR.exceed;
  if (value === target) return TARGET_BAR.exact;
  return TARGET_BAR.below;
}

function targetStatus(value: number, target: number) {
  if (value > target) return "Exceeded target";
  if (value === target) return "On target";
  return "Below target";
}

const RANGE_PILLS: { key: AnalyticsQuickRange; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
  { key: "custom", label: "Custom" },
];

type Grain = "day" | "week" | "month";

type CategoryBarPoint = TrendPoint & {
  fill: string;
  status: string;
  target: number;
};

function TargetLegend() {
  return (
    <div className="flex flex-wrap items-center gap-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span
          className="h-2.5 w-2.5 rounded-sm"
          style={{ background: TARGET_BAR.below }}
        />
        Below
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          className="h-2.5 w-2.5 rounded-sm"
          style={{ background: TARGET_BAR.exact }}
        />
        On target
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          className="h-2.5 w-2.5 rounded-sm"
          style={{ background: TARGET_BAR.exceed }}
        />
        Exceeded
      </span>
    </div>
  );
}

function CategoryTargetBarChart({
  categories,
  categoryId,
  onCategoryChange,
  series,
  target,
  categoryName,
}: {
  categories: Category[];
  categoryId: string;
  onCategoryChange: (id: string) => void;
  series: CategoryBarPoint[];
  target: number | null;
  categoryName: string | null;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          <h3 className="text-sm font-bold tracking-tight">
            Category BarChart
            {categoryName ? (
              <span className="font-semibold text-muted-foreground">
                {" "}
                · {categoryName}
              </span>
            ) : null}
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {target != null
              ? `Daily totals vs target ${target} — colors show below / on / above target`
              : "Choose a category in this chart to compare daily totals against its target"}
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
          <TargetLegend />
          <label className="block min-w-[12rem] sm:min-w-[14rem]">
            <span className="sr-only">Bar chart category</span>
            <select
              value={categoryId}
              onChange={(e) => onCategoryChange(e.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-xs font-semibold outline-none ring-teal-500/30 focus:ring-2"
              aria-label="Select category for bar chart"
            >
              <option value="">Select category…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} (target {c.target}/day)
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="min-w-0 p-2 pt-3 sm:p-4" style={{ height: 320 }}>
        {!categoryId ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-sm font-semibold">No category selected</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Use the category dropdown in this chart to view one category’s
              daily bars with target-based colors.
            </p>
          </div>
        ) : series.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No daily data for this category in the selected range.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={series}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
              <XAxis
                dataKey="period"
                tick={CHART_TICK}
                interval="preserveStartEnd"
              />
              <YAxis allowDecimals={false} tick={CHART_TICK} />
              <Tooltip
                {...CHART_TOOLTIP_STYLE}
                formatter={(value, _name, item) => {
                  const payload = item?.payload as CategoryBarPoint | undefined;
                  const status = payload?.status ?? "";
                  const tgt = payload?.target ?? target ?? 0;
                  return [`${value} / ${tgt} · ${status}`, "Day total"];
                }}
              />
              {target != null ? (
                <ReferenceLine
                  y={target}
                  stroke="#f59e0b"
                  strokeDasharray="4 4"
                  label={{
                    value: `Target ${target}`,
                    fill: "hsl(var(--muted-foreground))",
                    fontSize: 11,
                    position: "insideTopRight",
                  }}
                />
              ) : null}
              <Bar
                dataKey="value"
                name="Day total"
                radius={[6, 6, 0, 0]}
                maxBarSize={48}
              >
                {series.map((entry, index) => (
                  <Cell
                    key={`bar-${entry.periodStart}-${index}`}
                    fill={entry.fill}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export default function DashboardAnalytics() {
  const defaultRange = resolveAnalyticsQuickRange("today");
  const [quick, setQuick] = useState<AnalyticsQuickRange>("today");
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [categories, setCategories] = useState<Category[]>([]);
  /** Dashboard filter — scopes KPIs and other charts (not the BarChart picker). */
  const [filterCategoryId, setFilterCategoryId] = useState("");
  /** Independent category for the target BarChart. */
  const [barCategoryId, setBarCategoryId] = useState("");
  const [grain, setGrain] = useState<Grain>("day");
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const trackingStart = getTrackingStartDate();

  useEffect(() => {
    void api<Category[]>("/api/categories")
      .then((list) => {
        const active = list.filter((c) => c.isActive);
        setCategories(active.length ? active : list);
      })
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        // Always load all categories so the BarChart can pick any category
        // independently of the dashboard filter.
        const params = new URLSearchParams({
          range: quick,
          from,
          to,
        });
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
  }, [quick, from, to]);

  useEffect(() => {
    if (
      filterCategoryId &&
      categories.length > 0 &&
      !categories.some((c) => c.id === filterCategoryId)
    ) {
      setFilterCategoryId("");
    }
    if (
      barCategoryId &&
      categories.length > 0 &&
      !categories.some((c) => c.id === barCategoryId)
    ) {
      setBarCategoryId("");
    }
  }, [categories, filterCategoryId, barCategoryId]);

  function applyQuick(key: AnalyticsQuickRange) {
    setQuick(key);
    if (key !== "custom") {
      const range = resolveAnalyticsQuickRange(key);
      setFrom(range.from);
      setTo(range.to);
    }
  }

  function resetFilters() {
    const range = resolveAnalyticsQuickRange("today");
    setQuick("today");
    setFrom(range.from);
    setTo(range.to);
    setFilterCategoryId("");
  }

  const filteredProgressive = useMemo(() => {
    if (!data) return [];
    if (!filterCategoryId) return data.progressiveByCategory;
    return data.progressiveByCategory.filter(
      (c) => c.categoryId === filterCategoryId
    );
  }, [data, filterCategoryId]);

  const filteredByCategory = useMemo(() => {
    if (!data) return [];
    if (!filterCategoryId) return data.byCategory;
    return data.byCategory.filter((c) => c.categoryId === filterCategoryId);
  }, [data, filterCategoryId]);

  const filteredKpis = useMemo(() => {
    if (!data) return null;
    if (!filterCategoryId) return data.kpis;
    const cat = data.byCategory.find((c) => c.categoryId === filterCategoryId);
    const progressive = data.progressiveByCategory.find(
      (c) => c.categoryId === filterCategoryId
    );
    const todayPoint = progressive?.series.find(
      (p) => p.periodStart === data.appliedRange.to
    );
    const todayTotal = todayPoint?.value ?? 0;
    return {
      ...data.kpis,
      todayTotal,
      rangeTotal: cat?.total ?? 0,
      entryCount: cat?.entryCount ?? 0,
      activeCategories: cat ? 1 : 0,
      categoriesHitTarget:
        todayTotal >= (progressive?.target ?? Number.POSITIVE_INFINITY) ? 1 : 0,
      weekTotal: data.kpis.weekTotal,
      monthTotal: data.kpis.monthTotal,
      yearTotal: data.kpis.yearTotal,
    };
  }, [data, filterCategoryId]);

  const trend = useMemo(() => {
    if (!data) return [];
    if (filterCategoryId) {
      const cat = data.progressiveByCategory.find(
        (c) => c.categoryId === filterCategoryId
      );
      return cat?.series ?? [];
    }
    return data.trends[grain] ?? [];
  }, [data, grain, filterCategoryId]);

  const barCategory = useMemo(() => {
    if (!data || !barCategoryId) return null;
    return (
      data.progressiveByCategory.find((c) => c.categoryId === barCategoryId) ??
      null
    );
  }, [data, barCategoryId]);

  const categoryBarSeries = useMemo((): CategoryBarPoint[] => {
    if (!barCategory) return [];
    const target = barCategory.target;
    return barCategory.series.map((point) => ({
      ...point,
      target,
      fill: targetBarColor(point.value, target),
      status: targetStatus(point.value, target),
    }));
  }, [barCategory]);

  const progressiveChartData = useMemo(() => {
    if (!filteredProgressive.length) return [];
    const days = filteredProgressive[0]?.series ?? [];
    return days.map((point, idx) => {
      const row: Record<string, string | number> = {
        period: point.period,
        periodStart: point.periodStart,
      };
      for (const cat of filteredProgressive) {
        row[cat.name] = cat.series[idx]?.value ?? 0;
      }
      return row;
    });
  }, [filteredProgressive]);

  const filteredSingleProgressive =
    filteredProgressive.length === 1 ? filteredProgressive[0] : null;

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
              min={trackingStart}
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
              min={trackingStart}
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
              value={filterCategoryId}
              onChange={(e) => setFilterCategoryId(e.target.value)}
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
      ) : data && filteredKpis ? (
        <>
          <p className="text-xs text-muted-foreground">
            Metrics count from go-live ({trackingStartLabel(trackingStart)}).
            Week / month / year ranges are clipped to that start date.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <AnalyticsKpiCard
              label="Today"
              sub="Sum of today's entries"
              value={filteredKpis.todayTotal}
              icon={CalendarDays}
              theme={KPI_THEMES.today}
            />
            <AnalyticsKpiCard
              label="This Week"
              sub="Last 7 days"
              value={filteredKpis.weekTotal}
              icon={TrendingUp}
              theme={KPI_THEMES.week}
            />
            <AnalyticsKpiCard
              label="This Month"
              sub="Month to date"
              value={filteredKpis.monthTotal}
              icon={CalendarRange}
              theme={KPI_THEMES.month}
            />
            <AnalyticsKpiCard
              label="This Year"
              sub="Year to date"
              value={filteredKpis.yearTotal}
              icon={Target}
              theme={KPI_THEMES.year}
            />
            <AnalyticsKpiCard
              label="Selected Range"
              sub={`${data.appliedRange.from} → ${data.appliedRange.to}`}
              value={filteredKpis.rangeTotal}
              icon={TrendingUp}
              theme={KPI_THEMES.range}
            />
            <AnalyticsKpiCard
              label="Targets Hit Today"
              sub={`${filteredKpis.categoriesHitTarget} of ${filteredKpis.activeCategories} categories met daily target`}
              value={filteredKpis.categoriesHitTarget}
              icon={CheckCircle2}
              theme={KPI_THEMES.target}
            />
          </div>

          <CategoryTargetBarChart
            categories={categories}
            categoryId={barCategoryId}
            onCategoryChange={setBarCategoryId}
            series={categoryBarSeries}
            target={barCategory?.target ?? null}
            categoryName={barCategory?.name ?? null}
          />

          <div className="grid gap-4 xl:grid-cols-2">
            <TrendChartShell
              title={
                filterCategoryId
                  ? "Entry trend (filtered category)"
                  : "Entry trend"
              }
              chartHeight={260}
              action={
                filterCategoryId ? undefined : (
                  <select
                    value={grain}
                    onChange={(e) => setGrain(e.target.value as Grain)}
                    className="h-8 rounded-lg border border-border bg-background px-2 text-xs"
                  >
                    <option value="day">Day</option>
                    <option value="week">Week</option>
                    <option value="month">Month</option>
                  </select>
                )
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
              rows={filteredByCategory.map((c) => ({
                label: c.name,
                count: Math.round(c.avgDaily),
                sub: `Daily target ${c.target} · avg ${c.avgDaily} · hit ${c.daysHit}/${c.daysTracked || 0} days`,
              }))}
              emptyLabel="No entries in this range. Add categories and log daily values."
            />
          </div>

          <TrendChartShell
            title={
              filteredSingleProgressive
                ? `Daily total · ${filteredSingleProgressive.name} (daily target ${filteredSingleProgressive.target})`
                : "Daily totals by category"
            }
            chartHeight={300}
          >
            <ResponsiveContainer width="100%" height="100%">
              {filteredSingleProgressive ? (
                <AreaChart data={filteredSingleProgressive.series}>
                  <defs>
                    <linearGradient id="progFill" x1="0" y1="0" x2="0" y2="1">
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
                  <ReferenceLine
                    y={filteredSingleProgressive.target}
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
                    stroke="#0d9488"
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
                  {filteredProgressive.map((cat, i) => (
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
