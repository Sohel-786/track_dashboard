"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Flame,
  Layers,
  Loader2,
  Plus,
  TrendingUp,
} from "lucide-react";
import { api } from "@/lib/client-api";
import {
  resolveAnalyticsQuickRange,
  type AnalyticsQuickRange,
} from "@/lib/date-ranges";
import type {
  AnalyticsResponse,
  Category,
  DaySummary,
  EntriesResponse,
} from "@/types";
import {
  ConsistencyHeatmap,
  EmptyState,
  SectionCard,
  StatTile,
  type HeatmapDay,
} from "@/components/dashboard/insight-widgets";
import {
  CHART_GRID_STROKE,
  CHART_TICK,
  CHART_TOOLTIP_STYLE,
  SEMANTIC_COLORS,
} from "@/components/dashboard/chart-theme";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
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
const BarChart = dynamic(() => import("recharts").then((m) => m.BarChart), {
  ssr: false,
});
const Bar = dynamic(() => import("recharts").then((m) => m.Bar), { ssr: false });
const Cell = dynamic(() => import("recharts").then((m) => m.Cell), {
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

const RANGE_PILLS: { key: AnalyticsQuickRange; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "7 days" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
  { key: "custom", label: "Custom" },
];

function pct(part: number, whole: number) {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

/**
 * Entry analytics, cut down to what a person actually reads.
 *
 * Today's category targets sit at the top because that is the only part that is
 * still actionable; the range charts below answer "how has it been going" in a
 * single trend and a single consistency grid rather than five overlapping ones.
 */
export default function DashboardAnalytics() {
  const baseline = resolveAnalyticsQuickRange("week");
  const [quick, setQuick] = useState<AnalyticsQuickRange>("week");
  const [from, setFrom] = useState(baseline.from);
  const [to, setTo] = useState(baseline.to);
  const [categoryId, setCategoryId] = useState("");

  const [categories, setCategories] = useState<Category[]>([]);
  const [today, setToday] = useState<DaySummary[]>([]);
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const trackingStart = data?.trackingStart ?? null;

  useEffect(() => {
    void api<Category[]>("/api/categories")
      .then((list) => setCategories(list.filter((c) => c.isActive)))
      .catch(() => setCategories([]));

    void api<EntriesResponse>("/api/entries")
      .then((payload) => setToday(payload.daySummaries))
      .catch(() => setToday([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ range: quick, from, to });
      if (categoryId) params.set("categoryId", categoryId);
      setData(await api<AnalyticsResponse>(`/api/analytics?${params}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [quick, from, to, categoryId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** A deleted category must not stay selected and silently filter everything. */
  useEffect(() => {
    if (
      categoryId &&
      categories.length > 0 &&
      !categories.some((c) => c.id === categoryId)
    ) {
      setCategoryId("");
    }
  }, [categories, categoryId]);

  function applyQuick(key: AnalyticsQuickRange) {
    setQuick(key);
    if (key !== "custom") {
      const range = resolveAnalyticsQuickRange(key);
      setFrom(range.from);
      setTo(range.to);
    }
  }

  const kpis = data?.kpis ?? null;
  const selected = categories.find((c) => c.id === categoryId) ?? null;

  const todayRows = useMemo(() => {
    const rows = selected
      ? today.filter((row) => row.categoryId === selected.id)
      : today;
    // Unfinished first — the ones that still need something done today.
    return [...rows].sort((a, b) => {
      if (a.hitTarget !== b.hitTarget) return a.hitTarget ? 1 : -1;
      return b.progress - a.progress;
    });
  }, [today, selected]);

  const todayHit = todayRows.filter((r) => r.hitTarget).length;

  const heatmapDays: HeatmapDay[] = useMemo(
    () =>
      (data?.dailyTargetHits ?? []).map((d) => ({
        date: d.date,
        intensity: d.total > 0 ? d.hits / d.total : 0,
        title: `${d.date} — ${d.hits}/${d.total} on target`,
      })),
    [data]
  );

  /** One category selected: compare each day to its target. Otherwise: totals. */
  const categorySeries = useMemo(() => {
    if (!selected || !data) return [];
    const series = data.progressiveByCategory.find(
      (c) => c.categoryId === selected.id
    );
    if (!series) return [];
    return series.series.map((point) => ({
      ...point,
      target: series.target,
      fill:
        point.value >= series.target
          ? SEMANTIC_COLORS.positive
          : point.value > 0
            ? SEMANTIC_COLORS.warning
            : SEMANTIC_COLORS.neutral,
    }));
  }, [selected, data]);

  const trend = data?.trends.day ?? [];

  const attainment = useMemo(
    () =>
      (data?.byCategory ?? [])
        .map((c) => ({
          id: c.categoryId,
          name: c.name,
          pct: c.daysHitPct,
          hit: c.daysHit,
          days: c.daysTracked,
        }))
        .sort((a, b) => b.pct - a.pct),
    [data]
  );

  const onTargetPct =
    kpis && kpis.dayTargetsPossible > 0
      ? pct(kpis.dayTargetsHit, kpis.dayTargetsPossible)
      : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Dashboard
        </h1>
        <Button asChild size="sm" className="w-full sm:w-auto">
          <Link href="/entries">
            <Plus className="h-4 w-4" />
            Add entry
          </Link>
        </Button>
      </div>

      {/* One control bar: when, and which category. Nothing else. */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:p-4">
        <div className="flex flex-wrap items-center gap-1 rounded-xl bg-muted p-1">
          {RANGE_PILLS.map((pill) => (
            <button
              key={pill.key}
              type="button"
              onClick={() => applyQuick(pill.key)}
              aria-pressed={quick === pill.key}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-bold transition sm:text-sm",
                quick === pill.key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {pill.label}
            </button>
          ))}
        </div>

        {quick === "custom" ? (
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <div className="min-w-[9rem] flex-1 sm:max-w-[11rem]">
              <DatePicker
                value={from}
                minIso={trackingStart ?? undefined}
                maxIso={to}
                onChange={(iso) => iso && setFrom(iso)}
              />
            </div>
            <div className="min-w-[9rem] flex-1 sm:max-w-[11rem]">
              <DatePicker
                value={to}
                minIso={from}
                onChange={(iso) => iso && setTo(iso)}
              />
            </div>
          </div>
        ) : null}

        <div className="w-full sm:ml-auto sm:w-56">
          <Select
            value={categoryId || SELECT_ALL}
            onValueChange={(value) =>
              setCategoryId(value === SELECT_ALL ? "" : value)
            }
          >
            <SelectTrigger aria-label="Filter by category">
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
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-400 bg-rose-500/12 p-6 text-sm font-medium text-rose-800 dark:border-rose-400/40 dark:bg-rose-400/12 dark:text-rose-200">
          {error}
        </div>
      ) : categories.length === 0 && !loading ? (
        <EmptyState
          icon={Layers}
          title="No categories yet"
          action={
            <Button asChild>
              <Link href="/categories">
                <Plus className="h-4 w-4" />
                Create a category
              </Link>
            </Button>
          }
        />
      ) : loading && !data ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : data && kpis ? (
        <>
          {/* Today first — the only part that can still be changed today. */}
          <TodayBoard rows={todayRows} hit={todayHit} />

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="Today"
              value={kpis.todayTotal}
              icon={CalendarDays}
              accent="teal"
              progress={pct(todayHit, todayRows.length)}
            />
            <StatTile
              label="This week"
              value={kpis.weekTotal}
              icon={TrendingUp}
              accent="blue"
            />
            <StatTile
              label="On target"
              value={`${onTargetPct}%`}
              icon={CheckCircle2}
              accent={
                onTargetPct >= 80
                  ? "emerald"
                  : onTargetPct >= 50
                    ? "amber"
                    : "rose"
              }
              progress={onTargetPct}
            />
            <StatTile
              label="Perfect days"
              value={kpis.perfectDays}
              icon={Flame}
              accent="violet"
              progress={pct(kpis.perfectDays, kpis.rangeDays)}
            />
          </div>

          <SectionCard title={selected ? selected.name : "Daily total"}>
            <div className="h-[16rem] w-full">
              <ResponsiveContainer width="100%" height="100%">
                {selected ? (
                  <BarChart
                    data={categorySeries}
                    margin={{ top: 12, right: 8, left: 0 }}
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
                      width={32}
                    />
                    <Tooltip {...CHART_TOOLTIP_STYLE} />
                    <ReferenceLine
                      y={selected.target}
                      stroke={SEMANTIC_COLORS.warning}
                      strokeDasharray="4 4"
                    />
                    <Bar
                      dataKey="value"
                      name="Total"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={44}
                    >
                      {categorySeries.map((point, i) => (
                        <Cell key={`${point.periodStart}-${i}`} fill={point.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                ) : (
                  <AreaChart data={trend} margin={{ top: 12, right: 8, left: 0 }}>
                    <defs>
                      <linearGradient id="dashFill" x1="0" y1="0" x2="0" y2="1">
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
                      width={32}
                    />
                    <Tooltip {...CHART_TOOLTIP_STYLE} />
                    <Area
                      type="monotone"
                      dataKey="value"
                      name="Total"
                      stroke={SEMANTIC_COLORS.accent}
                      strokeWidth={2.5}
                      fill="url(#dashFill)"
                    />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
          </SectionCard>

          <div className="grid gap-4 xl:grid-cols-2">
            <SectionCard title="Target hit rate">
              {attainment.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nothing logged in this range.
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {attainment.map((row) => (
                    <li key={row.id} className="flex items-center gap-3">
                      <span className="w-28 shrink-0 truncate text-sm font-semibold">
                        {row.name}
                      </span>
                      <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <span
                          className={cn(
                            "block h-full rounded-full transition-all duration-500",
                            row.pct >= 80
                              ? "bg-emerald-600 dark:bg-emerald-400"
                              : row.pct >= 50
                                ? "bg-amber-700 dark:bg-amber-400"
                                : "bg-rose-600 dark:bg-rose-400"
                          )}
                          style={{ width: `${Math.min(100, row.pct)}%` }}
                        />
                      </span>
                      <span className="w-20 shrink-0 text-right text-xs font-bold tabular-nums">
                        {row.hit}/{row.days}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard title="Consistency">
              <ConsistencyHeatmap days={heatmapDays} legendLow="0" legendHigh="All" />
            </SectionCard>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Today's categories as one glanceable board — the daily-entries view. */
function TodayBoard({ rows, hit }: { rows: DaySummary[]; hit: number }) {
  if (rows.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <h2 className="text-sm font-bold tracking-tight">Today</h2>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-bold tabular-nums",
            hit === rows.length
              ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
              : "bg-muted text-muted-foreground"
          )}
        >
          {hit}/{rows.length}
        </span>
      </header>

      <ul className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <li key={row.categoryId} className="bg-card p-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="min-w-0 truncate text-sm font-bold tracking-tight">
                {row.name}
              </p>
              <p className="shrink-0 text-sm font-bold tabular-nums">
                <span
                  className={cn(
                    row.hitTarget
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-foreground"
                  )}
                >
                  {row.dayTotal}
                </span>
                <span className="text-muted-foreground">/{row.target}</span>
              </p>
            </div>

            <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  row.hitTarget
                    ? "bg-emerald-600 dark:bg-emerald-400"
                    : row.progress >= 50
                      ? "bg-teal-600 dark:bg-teal-400"
                      : "bg-amber-700 dark:bg-amber-400"
                )}
                style={{ width: `${Math.min(100, row.progress)}%` }}
              />
            </div>

            <p className="mt-2 text-[11px] font-semibold text-muted-foreground">
              {row.hitTarget ? (
                <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-3 w-3" />
                  Done
                </span>
              ) : (
                `${row.remaining} to go`
              )}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
