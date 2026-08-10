"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  Loader2,
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
import { hasActiveAnalyticsRangeFilter } from "@/lib/filter-utils";
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
import { listFilterCardClass } from "@/lib/ui-styles";
import { Button } from "@/components/ui/button";
import { ClearFiltersButton } from "@/components/ui/clear-filters-button";
import { DatePicker } from "@/components/ui/date-picker";
import { FilterLabel } from "@/components/ui/label";
import {
  SELECT_ALL,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
          <div className="min-w-[12rem] sm:min-w-[14rem]">
            <span className="sr-only">Bar chart category</span>
            <Select
              value={categoryId || SELECT_ALL}
              onValueChange={(value) =>
                onCategoryChange(value === SELECT_ALL ? "" : value)
              }
            >
              <SelectTrigger
                className="h-9 text-xs font-semibold"
                aria-label="Select category for bar chart"
              >
                <SelectValue placeholder="Select category…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SELECT_ALL}>Select category…</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} (target {c.target}/day)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
  const baselineRange = resolveAnalyticsQuickRange("week");
  const [quick, setQuick] = useState<AnalyticsQuickRange>("week");
  const [from, setFrom] = useState(baselineRange.from);
  const [to, setTo] = useState(baselineRange.to);
  const [categories, setCategories] = useState<Category[]>([]);
  /** Dashboard filter — scopes KPIs and other charts (not the BarChart picker). */
  const [filterCategoryId, setFilterCategoryId] = useState("");
  /** Independent category for the target BarChart. */
  const [barCategoryId, setBarCategoryId] = useState("");
  const [grain, setGrain] = useState<Grain>("day");
  /** Unfiltered analytics payload — always includes every category (BarChart source). */
  const [baseData, setBaseData] = useState<AnalyticsResponse | null>(null);
  /** Category-scoped payload when the dashboard category filter is set. */
  const [scopedData, setScopedData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [scopedLoading, setScopedLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trackingStart = getTrackingStartDate();

  const hasActiveFilters = useMemo(
    () =>
      Boolean(filterCategoryId) ||
      hasActiveAnalyticsRangeFilter(quick, from, to, "week"),
    [filterCategoryId, quick, from, to]
  );

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
    async function loadBase() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ range: quick, from, to });
        const result = await api<AnalyticsResponse>(
          `/api/analytics?${params.toString()}`
        );
        if (!cancelled) setBaseData(result);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load analytics");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadBase();
    return () => {
      cancelled = true;
    };
  }, [quick, from, to]);

  useEffect(() => {
    let cancelled = false;
    async function loadScoped() {
      if (!filterCategoryId) {
        setScopedData(null);
        setScopedLoading(false);
        return;
      }
      setScopedLoading(true);
      try {
        const params = new URLSearchParams({
          range: quick,
          from,
          to,
          categoryId: filterCategoryId,
        });
        const result = await api<AnalyticsResponse>(
          `/api/analytics?${params.toString()}`
        );
        if (!cancelled) setScopedData(result);
      } catch {
        if (!cancelled) setScopedData(null);
      } finally {
        if (!cancelled) setScopedLoading(false);
      }
    }
    void loadScoped();
    return () => {
      cancelled = true;
    };
  }, [quick, from, to, filterCategoryId]);

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
    const range = resolveAnalyticsQuickRange("week");
    setQuick("week");
    setFrom(range.from);
    setTo(range.to);
    setFilterCategoryId("");
    setScopedData(null);
  }

  /** Charts / KPIs (everything except Category BarChart) honor the filter. */
  const data =
    filterCategoryId && scopedData
      ? scopedData
      : !filterCategoryId
        ? baseData
        : null;
  const awaitingCategoryScope =
    Boolean(filterCategoryId) && scopedLoading && !scopedData;

  const filteredProgressive = useMemo(() => {
    if (!data) return [];
    return data.progressiveByCategory;
  }, [data]);

  const filteredByCategory = useMemo(() => {
    if (!data) return [];
    return data.byCategory;
  }, [data]);

  const filteredKpis = useMemo(() => {
    if (!data) return null;
    return data.kpis;
  }, [data]);

  const trend = useMemo(() => {
    if (!data) return [];
    return data.trends[grain] ?? [];
  }, [data, grain]);

  /** BarChart always reads the unfiltered payload so its own picker stays independent. */
  const barCategory = useMemo(() => {
    if (!baseData || !barCategoryId) return null;
    return (
      baseData.progressiveByCategory.find(
        (c) => c.categoryId === barCategoryId
      ) ?? null
    );
  }, [baseData, barCategoryId]);

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

  const filterCategoryName =
    categories.find((c) => c.id === filterCategoryId)?.name ?? null;

  return (
    <div className="space-y-6">
      <div className={listFilterCardClass}>
        <div className="flex flex-wrap gap-2 border-b border-border px-4 py-3">
          {RANGE_PILLS.map((pill) => (
            <Button
              key={pill.key}
              type="button"
              size="sm"
              variant={quick === pill.key ? "default" : "secondary"}
              onClick={() => applyQuick(pill.key)}
              className={cn(
                "rounded-full px-3",
                quick === pill.key
                  ? "shadow-sm"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {pill.label}
            </Button>
          ))}
        </div>

        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="w-full min-w-[10rem] sm:w-44">
            <FilterLabel>From</FilterLabel>
            <DatePicker
              value={from}
              onChange={(iso) => {
                if (!iso) return;
                setQuick("custom");
                setFrom(iso);
              }}
            />
          </div>
          <div className="w-full min-w-[10rem] sm:w-44">
            <FilterLabel>To</FilterLabel>
            <DatePicker
              value={to}
              onChange={(iso) => {
                if (!iso) return;
                setQuick("custom");
                setTo(iso);
              }}
            />
          </div>
          <div className="w-full min-w-[12rem] flex-1 sm:max-w-xs">
            <FilterLabel>Category</FilterLabel>
            <Select
              value={filterCategoryId || SELECT_ALL}
              onValueChange={(value) =>
                setFilterCategoryId(value === SELECT_ALL ? "" : value)
              }
            >
              <SelectTrigger aria-label="Filter dashboard by category">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SELECT_ALL}>All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {hasActiveFilters ? (
            <ClearFiltersButton onClick={resetFilters} />
          ) : null}
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
      ) : baseData ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>
              Metrics count from go-live ({trackingStartLabel(trackingStart)}).
              Week / month / year ranges are clipped to that start date.
            </span>
            {filterCategoryName ? (
              <span className="inline-flex items-center rounded-full bg-teal-500/15 px-2.5 py-0.5 font-semibold text-teal-800 dark:text-teal-200">
                Filtered · {filterCategoryName}
                {scopedLoading ? (
                  <Loader2 className="ml-1.5 h-3 w-3 animate-spin" />
                ) : null}
              </span>
            ) : null}
          </div>

          {awaitingCategoryScope || !data || !filteredKpis ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading filtered analytics...
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <AnalyticsKpiCard
                label="Today"
                sub={
                  filterCategoryName
                    ? `Today · ${filterCategoryName}`
                    : "Sum of today's entries"
                }
                value={filteredKpis.todayTotal}
                icon={CalendarDays}
                theme={KPI_THEMES.today}
              />
              <AnalyticsKpiCard
                label="This Week"
                sub={
                  filterCategoryName
                    ? `Last 7 days · ${filterCategoryName}`
                    : "Last 7 days"
                }
                value={filteredKpis.weekTotal}
                icon={TrendingUp}
                theme={KPI_THEMES.week}
              />
              <AnalyticsKpiCard
                label="This Month"
                sub={
                  filterCategoryName
                    ? `Month to date · ${filterCategoryName}`
                    : "Month to date"
                }
                value={filteredKpis.monthTotal}
                icon={CalendarRange}
                theme={KPI_THEMES.month}
              />
              <AnalyticsKpiCard
                label="This Year"
                sub={
                  filterCategoryName
                    ? `Year to date · ${filterCategoryName}`
                    : "Year to date"
                }
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
          )}

          <CategoryTargetBarChart
            categories={categories}
            categoryId={barCategoryId}
            onCategoryChange={setBarCategoryId}
            series={categoryBarSeries}
            target={barCategory?.target ?? null}
            categoryName={barCategory?.name ?? null}
          />

          {awaitingCategoryScope || !data || !filteredKpis ? null : (
            <>
              <div className="grid gap-4 xl:grid-cols-2">
                <TrendChartShell
                  title={
                    filterCategoryName
                      ? `Entry trend · ${filterCategoryName}`
                      : "Entry trend"
                  }
                  chartHeight={260}
                  action={
                    <Select
                      value={grain}
                      onValueChange={(value) => setGrain(value as Grain)}
                    >
                      <SelectTrigger className="h-8 w-[7.5rem] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="day">Day</SelectItem>
                        <SelectItem value="week">Week</SelectItem>
                        <SelectItem value="month">Month</SelectItem>
                      </SelectContent>
                    </Select>
                  }
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trend}>
                      <defs>
                        <linearGradient
                          id="trendFill"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#0d9488"
                            stopOpacity={0.35}
                          />
                          <stop
                            offset="95%"
                            stopColor="#0d9488"
                            stopOpacity={0.02}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={CHART_GRID_STROKE}
                      />
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
                  title={
                    filterCategoryName
                      ? `Category progress · ${filterCategoryName}`
                      : "By category (avg daily vs daily target)"
                  }
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
                        <linearGradient
                          id="progFill"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#0d9488"
                            stopOpacity={0.35}
                          />
                          <stop
                            offset="95%"
                            stopColor="#0d9488"
                            stopOpacity={0.02}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={CHART_GRID_STROKE}
                      />
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
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={CHART_GRID_STROKE}
                      />
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
          )}
        </>
      ) : null}
    </div>
  );
}
