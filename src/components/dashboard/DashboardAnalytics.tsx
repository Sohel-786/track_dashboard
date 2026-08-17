"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  Flame,
  Layers,
  Loader2,
  Plus,
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
  ChartCard,
  ChartLegend,
  ConsistencyHeatmap,
  EmptyState,
  ProgressRing,
  RateBars,
  SectionCard,
  StatTile,
  type HeatmapDay,
} from "@/components/dashboard/insight-widgets";
import {
  CHART_GRID_STROKE,
  CHART_TICK,
  CHART_TOOLTIP_STYLE,
  SEMANTIC_COLORS,
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

const AreaChart = dynamic(() => import("recharts").then((m) => m.AreaChart), {
  ssr: false,
});
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
  below: SEMANTIC_COLORS.negative,
  exact: SEMANTIC_COLORS.accent,
  exceed: SEMANTIC_COLORS.violet,
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
  { key: "week", label: "7 days" },
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

export default function DashboardAnalytics() {
  const baselineRange = resolveAnalyticsQuickRange("week");
  const [quick, setQuick] = useState<AnalyticsQuickRange>("week");
  const [from, setFrom] = useState(baselineRange.from);
  const [to, setTo] = useState(baselineRange.to);
  const [categories, setCategories] = useState<Category[]>([]);
  /** Dashboard filter — scopes KPIs and every chart except the bar picker. */
  const [filterCategoryId, setFilterCategoryId] = useState("");
  /** Independent category for the target BarChart. */
  const [barCategoryId, setBarCategoryId] = useState("");
  const [grain, setGrain] = useState<Grain>("day");
  /** Unfiltered payload — always every category (BarChart source). */
  const [baseData, setBaseData] = useState<AnalyticsResponse | null>(null);
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

  const data =
    filterCategoryId && scopedData
      ? scopedData
      : !filterCategoryId
        ? baseData
        : null;
  const awaitingCategoryScope =
    Boolean(filterCategoryId) && scopedLoading && !scopedData;

  const kpis = data?.kpis ?? null;
  const byCategory = useMemo(() => data?.byCategory ?? [], [data]);
  const progressive = useMemo(() => data?.progressiveByCategory ?? [], [data]);
  const trend = useMemo(() => data?.trends[grain] ?? [], [data, grain]);

  const heatmapDays: HeatmapDay[] = useMemo(
    () =>
      (data?.dailyTargetHits ?? []).map((d) => ({
        date: d.date,
        intensity: d.total > 0 ? d.hits / d.total : 0,
        title: `${d.date} · ${d.hits}/${d.total} targets hit · ${d.value} logged`,
      })),
    [data]
  );

  const attainment = useMemo(
    () =>
      byCategory.map((c) => ({
        label: c.name,
        pct: c.daysHitPct,
        caption: `Target ${c.target}/day · avg ${c.avgDaily} · ${c.daysHit}/${c.daysTracked || 0} days hit`,
        color:
          c.daysHitPct >= 80
            ? SEMANTIC_COLORS.positive
            : c.daysHitPct >= 50
              ? SEMANTIC_COLORS.warning
              : SEMANTIC_COLORS.negative,
      })),
    [byCategory]
  );

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
    if (!progressive.length) return [];
    const days = progressive[0]?.series ?? [];
    return days.map((point, idx) => {
      const row: Record<string, string | number> = {
        period: point.period,
        periodStart: point.periodStart,
      };
      for (const cat of progressive) row[cat.name] = cat.series[idx]?.value ?? 0;
      return row;
    });
  }, [progressive]);

  const singleProgressive = progressive.length === 1 ? progressive[0] : null;
  const filterCategoryName =
    categories.find((c) => c.id === filterCategoryId)?.name ?? null;

  const targetAttainmentPct =
    kpis && kpis.dayTargetsPossible > 0
      ? Math.round((kpis.dayTargetsHit / kpis.dayTargetsPossible) * 1000) / 10
      : 0;

  return (
    <div className="space-y-5">
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
              minIso={trackingStart}
              maxIso={to}
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
              minIso={from}
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

        <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
          <span className="font-semibold text-foreground">
            {from} → {to}
          </span>
          {filterCategoryName ? (
            <span className="inline-flex items-center rounded-full bg-teal-500/15 px-2.5 py-0.5 font-semibold text-teal-800 dark:text-teal-200">
              {filterCategoryName} only
              {scopedLoading ? (
                <Loader2 className="ml-1.5 h-3 w-3 animate-spin" />
              ) : null}
            </span>
          ) : null}
          <span className="ml-auto">
            Counting from go-live ({trackingStartLabel(trackingStart)})
          </span>
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
      ) : categories.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No categories yet"
          description="Create a category with a daily target, then start logging entries against it."
          action={
            <Button asChild>
              <Link href="/categories">
                <Plus className="h-4 w-4" />
                Create a category
              </Link>
            </Button>
          }
        />
      ) : baseData ? (
        <>
          {awaitingCategoryScope || !data || !kpis ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading filtered analytics...
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
                <StatTile
                  label="Today"
                  value={kpis.todayTotal}
                  sub={
                    filterCategoryName
                      ? filterCategoryName
                      : `${kpis.categoriesHitTarget}/${kpis.activeCategories} targets hit`
                  }
                  icon={CalendarDays}
                  accent="teal"
                  progress={
                    kpis.activeCategories > 0
                      ? (kpis.categoriesHitTarget / kpis.activeCategories) * 100
                      : 0
                  }
                />
                <StatTile
                  label="This week"
                  value={kpis.weekTotal}
                  sub="Last 7 days"
                  icon={TrendingUp}
                  accent="blue"
                />
                <StatTile
                  label="This month"
                  value={kpis.monthTotal}
                  sub="Month to date"
                  icon={CalendarRange}
                  accent="violet"
                />
                <StatTile
                  label="This year"
                  value={kpis.yearTotal}
                  sub="Year to date"
                  icon={Target}
                  accent="emerald"
                />
                <StatTile
                  label="Selected range"
                  value={kpis.rangeTotal}
                  sub={`${kpis.entryCount} entries over ${kpis.rangeDays} days`}
                  icon={Activity}
                  accent="indigo"
                  delta={{
                    pct: data.deltas.rangeTotal,
                    label: `vs ${data.previousRange.from} → ${data.previousRange.to}`,
                  }}
                />
                <StatTile
                  label="Perfect days"
                  value={kpis.perfectDays}
                  sub={`Every category on target · ${kpis.activeDays} active days`}
                  icon={Flame}
                  accent="amber"
                  progress={
                    kpis.rangeDays > 0
                      ? (kpis.perfectDays / kpis.rangeDays) * 100
                      : 0
                  }
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,19rem)_1fr]">
                <SectionCard
                  title="Target attainment"
                  description="Category-days that met their daily target"
                  bodyClassName="flex items-center justify-center py-6"
                >
                  <ProgressRing
                    value={targetAttainmentPct}
                    label="On target"
                    color={
                      targetAttainmentPct >= 80
                        ? SEMANTIC_COLORS.positive
                        : targetAttainmentPct >= 50
                          ? SEMANTIC_COLORS.warning
                          : SEMANTIC_COLORS.negative
                    }
                    caption={`${kpis.dayTargetsHit} of ${kpis.dayTargetsPossible} category-days hit their target in this range.`}
                  />
                </SectionCard>

                <SectionCard
                  title="Consistency"
                  description="One square per day — darker means more targets met that day"
                >
                  <ConsistencyHeatmap
                    days={heatmapDays}
                    legendLow="None"
                    legendHigh="All"
                  />
                  <p className="mt-4 border-t border-border pt-3 text-[11px] text-muted-foreground">
                    Squares reflect how many categories reached their daily
                    target — not raw volume — so a light day means something was
                    skipped, however much you logged elsewhere.
                  </p>
                </SectionCard>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <ChartCard
                  title={
                    filterCategoryName
                      ? `Entry trend · ${filterCategoryName}`
                      : "Entry trend"
                  }
                  description="Total value logged per period"
                  height={270}
                  action={
                    <Select
                      value={grain}
                      onValueChange={(value) => setGrain(value as Grain)}
                    >
                      <SelectTrigger className="h-8 w-[7rem] text-xs">
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
                    <AreaChart data={trend} margin={{ top: 8, right: 8, left: 0 }}>
                      <defs>
                        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                          <stop
                            offset="5%"
                            stopColor={SEMANTIC_COLORS.accent}
                            stopOpacity={0.32}
                          />
                          <stop
                            offset="95%"
                            stopColor={SEMANTIC_COLORS.accent}
                            stopOpacity={0.02}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={CHART_GRID_STROKE}
                        vertical={false}
                      />
                      <XAxis
                        dataKey="period"
                        tick={CHART_TICK}
                        interval="preserveStartEnd"
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={CHART_TICK}
                        tickLine={false}
                        axisLine={false}
                        width={36}
                      />
                      <Tooltip {...CHART_TOOLTIP_STYLE} />
                      <Area
                        type="monotone"
                        dataKey="value"
                        name="Total"
                        stroke={SEMANTIC_COLORS.accent}
                        strokeWidth={2.5}
                        fill="url(#trendFill)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartCard>

                <SectionCard
                  title={
                    filterCategoryName
                      ? `Target hit rate · ${filterCategoryName}`
                      : "Target hit rate by category"
                  }
                  description="Share of days in range that met the daily target"
                >
                  <RateBars
                    rows={attainment}
                    emptyLabel="No entries in this range yet."
                  />
                </SectionCard>
              </div>

              <ChartCard
                title="Daily totals vs target"
                description={
                  barCategory
                    ? `${barCategory.name} — bars coloured by how the day landed against its ${barCategory.target}/day target`
                    : "Pick a category to compare each day against its daily target"
                }
                height={320}
                action={
                  <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <ChartLegend
                      items={[
                        { label: "Below", color: TARGET_BAR.below },
                        { label: "On target", color: TARGET_BAR.exact },
                        { label: "Exceeded", color: TARGET_BAR.exceed },
                      ]}
                    />
                    <div className="min-w-[12rem]">
                      <Select
                        value={barCategoryId || SELECT_ALL}
                        onValueChange={(value) =>
                          setBarCategoryId(value === SELECT_ALL ? "" : value)
                        }
                      >
                        <SelectTrigger
                          className="h-8 text-xs font-semibold"
                          aria-label="Select category for the daily bar chart"
                        >
                          <SelectValue placeholder="Select category…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SELECT_ALL}>
                            Select category…
                          </SelectItem>
                          {categories.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name} (target {c.target}/day)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                }
              >
                {!barCategoryId ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                    <CalendarCheck className="h-6 w-6 text-muted-foreground" />
                    <p className="text-sm font-semibold">No category selected</p>
                    <p className="max-w-sm text-xs text-muted-foreground">
                      Choose a category above to see each day&apos;s total
                      against its target.
                    </p>
                  </div>
                ) : categoryBarSeries.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    No daily data for this category in the selected range.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={categoryBarSeries}
                      margin={{ top: 8, right: 8, left: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={CHART_GRID_STROKE}
                        vertical={false}
                      />
                      <XAxis
                        dataKey="period"
                        tick={CHART_TICK}
                        interval="preserveStartEnd"
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={CHART_TICK}
                        tickLine={false}
                        axisLine={false}
                        width={36}
                      />
                      <Tooltip
                        {...CHART_TOOLTIP_STYLE}
                        formatter={(value, _name, item) => {
                          const payload = item?.payload as
                            | CategoryBarPoint
                            | undefined;
                          const tgt = payload?.target ?? 0;
                          return [
                            `${value} / ${tgt} · ${payload?.status ?? ""}`,
                            "Day total",
                          ];
                        }}
                      />
                      {barCategory ? (
                        <ReferenceLine
                          y={barCategory.target}
                          stroke={SEMANTIC_COLORS.warning}
                          strokeDasharray="4 4"
                          label={{
                            value: `Target ${barCategory.target}`,
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
                        {categoryBarSeries.map((entry, index) => (
                          <Cell
                            key={`bar-${entry.periodStart}-${index}`}
                            fill={entry.fill}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard
                title={
                  singleProgressive
                    ? `Daily total · ${singleProgressive.name} (target ${singleProgressive.target}/day)`
                    : "Daily totals by category"
                }
                description="Every category side by side over the selected range"
                height={300}
                action={
                  !singleProgressive && progressive.length > 1 ? (
                    <ChartLegend
                      items={progressive
                        .slice(0, 8)
                        .map((cat, i) => ({
                          label: cat.name,
                          color: SERIES_COLORS[i % SERIES_COLORS.length],
                        }))}
                    />
                  ) : null
                }
              >
                <ResponsiveContainer width="100%" height="100%">
                  {singleProgressive ? (
                    <AreaChart
                      data={singleProgressive.series}
                      margin={{ top: 8, right: 8, left: 0 }}
                    >
                      <defs>
                        <linearGradient id="progFill" x1="0" y1="0" x2="0" y2="1">
                          <stop
                            offset="5%"
                            stopColor={SEMANTIC_COLORS.accent}
                            stopOpacity={0.32}
                          />
                          <stop
                            offset="95%"
                            stopColor={SEMANTIC_COLORS.accent}
                            stopOpacity={0.02}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={CHART_GRID_STROKE}
                        vertical={false}
                      />
                      <XAxis
                        dataKey="period"
                        tick={CHART_TICK}
                        interval="preserveStartEnd"
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={CHART_TICK}
                        tickLine={false}
                        axisLine={false}
                        width={36}
                      />
                      <Tooltip {...CHART_TOOLTIP_STYLE} />
                      <ReferenceLine
                        y={singleProgressive.target}
                        stroke={SEMANTIC_COLORS.warning}
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
                        stroke={SEMANTIC_COLORS.accent}
                        strokeWidth={2.5}
                        fill="url(#progFill)"
                      />
                    </AreaChart>
                  ) : (
                    <LineChart
                      data={progressiveChartData}
                      margin={{ top: 8, right: 8, left: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={CHART_GRID_STROKE}
                        vertical={false}
                      />
                      <XAxis
                        dataKey="period"
                        tick={CHART_TICK}
                        interval="preserveStartEnd"
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={CHART_TICK}
                        tickLine={false}
                        axisLine={false}
                        width={36}
                      />
                      <Tooltip {...CHART_TOOLTIP_STYLE} />
                      {progressive.map((cat, i) => (
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
              </ChartCard>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
