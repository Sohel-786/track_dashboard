"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarRange,
  CheckCircle2,
  Flame,
  History,
  Loader2,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { api } from "@/lib/client-api";
import type { AnalyticsQuickRange } from "@/lib/date-ranges";
import {
  getTrackingStartDate,
  resolveAnalyticsQuickRange,
  trackingStartLabel,
} from "@/lib/date-ranges";
import { hasActiveAnalyticsRangeFilter } from "@/lib/filter-utils";
import { NAMAZ_PRAYERS, NAMAZ_PRAYER_META, type NamazPrayer } from "@/lib/namaz";
import type { NamazAnalyticsResponse } from "@/types";
import {
  AnalyticsKpiCard,
  TrendChartShell,
} from "@/components/dashboard/analytics-charts";
import {
  CHART_GRID_STROKE,
  CHART_TICK,
  CHART_TOOLTIP_STYLE,
  KPI_THEMES,
} from "@/components/dashboard/chart-theme";
import { AppDataTable } from "@/components/ui/AppDataTable";
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
import { cn } from "@/lib/utils";
import {
  listFilterCardClass,
  tableBodyCellClass,
  tableBodyRowClass,
  tableHeadCellClass,
  tableHeadRowClass,
} from "@/lib/ui-styles";

const BarChart = dynamic(() => import("recharts").then((m) => m.BarChart), {
  ssr: false,
});
const Bar = dynamic(() => import("recharts").then((m) => m.Bar), { ssr: false });
const AreaChart = dynamic(() => import("recharts").then((m) => m.AreaChart), {
  ssr: false,
});
const Area = dynamic(() => import("recharts").then((m) => m.Area), {
  ssr: false,
});
const LineChart = dynamic(() => import("recharts").then((m) => m.LineChart), {
  ssr: false,
});
const Line = dynamic(() => import("recharts").then((m) => m.Line), {
  ssr: false,
});
const PieChart = dynamic(() => import("recharts").then((m) => m.PieChart), {
  ssr: false,
});
const Pie = dynamic(() => import("recharts").then((m) => m.Pie), { ssr: false });
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
const Legend = dynamic(() => import("recharts").then((m) => m.Legend), {
  ssr: false,
});

const RANGE_PILLS: { key: AnalyticsQuickRange; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "Last 7 days" },
  { key: "last30", label: "Last 30 days" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
  { key: "custom", label: "Custom" },
];

const EXTRA_COLORS = {
  with: "#0d9488",
  without: "#94a3b8",
  onTime: "#059669",
  kaza: "#d97706",
  missed: "#e11d48",
  sunnah: "#0f766e",
  tasbeeh: "#7c3aed",
  zamaat: "#2563eb",
} as const;

type ReportFocus = "overview" | "extras" | "misses";

function pct(part: number, whole: number) {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

function FlagPill({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        on
          ? "bg-teal-500/15 text-teal-800 dark:text-teal-200"
          : "bg-muted text-muted-foreground"
      )}
    >
      {label}: {on ? "with" : "without"}
    </span>
  );
}

export function NamazDashboard({ refreshKey = 0 }: { refreshKey?: number }) {
  const baseline = resolveAnalyticsQuickRange("today");
  const [quick, setQuick] = useState<AnalyticsQuickRange>("today");
  const [from, setFrom] = useState(baseline.from);
  const [to, setTo] = useState(baseline.to);
  const [prayerFilter, setPrayerFilter] = useState("");
  const [focus, setFocus] = useState<ReportFocus>("overview");
  const [data, setData] = useState<NamazAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const trackingStart = getTrackingStartDate();

  const hasActiveFilters =
    Boolean(prayerFilter) ||
    focus !== "overview" ||
    hasActiveAnalyticsRangeFilter(quick, from, to, "today");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ range: quick, from, to });
      if (prayerFilter) params.set("prayer", prayerFilter);
      const result = await api<NamazAnalyticsResponse>(
        `/api/namaz/analytics?${params}`
      );
      setData(result);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to load namaz analytics"
      );
    } finally {
      setLoading(false);
    }
  }, [quick, from, to, prayerFilter]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

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
    setPrayerFilter("");
    setFocus("overview");
  }

  const prayerName = prayerFilter
    ? NAMAZ_PRAYER_META[prayerFilter as NamazPrayer]?.label
    : null;

  const kpis = data?.kpis ?? null;
  const daily = data?.daily ?? [];
  const yMaxCompletion = prayerFilter ? 1 : 5;

  const sunnahPie = useMemo(() => {
    if (!data) return [];
    const { with: w, without } = data.extrasShare.sunnah;
    return [
      { name: "With Sunnah", value: w, fill: EXTRA_COLORS.with },
      { name: "Without Sunnah", value: without, fill: EXTRA_COLORS.without },
    ].filter((d) => d.value > 0);
  }, [data]);

  const tasbeehPie = useMemo(() => {
    if (!data) return [];
    const { with: w, without } = data.extrasShare.tasbeeh;
    return [
      { name: "With Tasbeeh", value: w, fill: EXTRA_COLORS.tasbeeh },
      { name: "Without Tasbeeh", value: without, fill: EXTRA_COLORS.without },
    ].filter((d) => d.value > 0);
  }, [data]);

  const zamaatPie = useMemo(() => {
    if (!data) return [];
    const { with: w, without } = data.extrasShare.zamaat;
    return [
      { name: "With Zamaat", value: w, fill: EXTRA_COLORS.zamaat },
      { name: "Without Zamaat", value: without, fill: EXTRA_COLORS.without },
    ].filter((d) => d.value > 0);
  }, [data]);

  const byPrayerExtras = useMemo(() => {
    if (!data) return [];
    const rows = prayerFilter
      ? data.byPrayer.filter((p) => p.prayer === prayerFilter)
      : data.byPrayer;
    return rows.map((p) => ({
      label: p.label,
      sunnah: p.sunnah,
      sunnahWithout: p.sunnahWithout,
      tasbeeh: p.tasbeeh,
      tasbeehWithout: p.tasbeehWithout,
      zamaat: p.zamaat,
      zamaatWithout: p.zamaatWithout,
    }));
  }, [data, prayerFilter]);

  const dailyNewestFirst = useMemo(
    () => [...daily].slice().reverse(),
    [daily]
  );

  return (
    <section className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-300">
          KPI reports
        </p>
        <h2 className="mt-0.5 text-xl font-bold tracking-tight">
          Prayer practice analytics
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Day-by-day on-time Fard, plus whether each completed prayer was with
          or without Sunnah, Tasbeeh, and Zamaat. Tracking starts{" "}
          {trackingStartLabel(trackingStart)}.
        </p>
      </div>

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

        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="w-full min-w-[10rem] sm:w-44">
            <FilterLabel>From</FilterLabel>
            <DatePicker
              value={from}
              minIso={trackingStart}
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
              minIso={trackingStart}
              onChange={(iso) => {
                if (!iso) return;
                setQuick("custom");
                setTo(iso);
              }}
            />
          </div>
          <div className="w-full min-w-[12rem] flex-1 sm:max-w-xs">
            <FilterLabel>Prayer</FilterLabel>
            <Select
              value={prayerFilter || SELECT_ALL}
              onValueChange={(value) =>
                setPrayerFilter(value === SELECT_ALL ? "" : value)
              }
            >
              <SelectTrigger aria-label="Filter namaz analytics by prayer">
                <SelectValue placeholder="All prayers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SELECT_ALL}>All prayers</SelectItem>
                {NAMAZ_PRAYERS.map((prayer) => (
                  <SelectItem key={prayer} value={prayer}>
                    {NAMAZ_PRAYER_META[prayer].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full min-w-[12rem] flex-1 sm:max-w-xs">
            <FilterLabel>Report focus</FilterLabel>
            <Select
              value={focus}
              onValueChange={(value) => setFocus(value as ReportFocus)}
            >
              <SelectTrigger aria-label="Report focus">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="overview">Overview</SelectItem>
                <SelectItem value="extras">
                  Sunnah · Tasbeeh · Zamaat
                </SelectItem>
                <SelectItem value="misses">Misses & Kaza</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {hasActiveFilters ? (
            <ClearFiltersButton onClick={resetFilters} />
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 px-4 py-3 text-[11px] text-muted-foreground">
          <span className="font-semibold text-foreground">
            {from} → {to}
          </span>
          <span>·</span>
          <span>
            Checked extras count as <strong>with</strong>; unchecked completed
            prayers count as <strong>without</strong>
          </span>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading namaz analytics...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </div>
      ) : data && kpis ? (
        <>
          {prayerName ? (
            <p className="text-xs">
              <span className="inline-flex items-center rounded-full bg-teal-500/15 px-2.5 py-0.5 font-semibold text-teal-800 dark:text-teal-200">
                Filtered · {prayerName}
              </span>
            </p>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <AnalyticsKpiCard
              label="On time"
              sub={
                prayerName
                  ? `Fard on time · ${prayerName}`
                  : "Fard logged in window"
              }
              value={kpis.prayedInRange}
              icon={CheckCircle2}
              theme={KPI_THEMES.today}
            />
            <AnalyticsKpiCard
              label="Completed"
              sub={`${kpis.kazaInRange} via Kaza · ${kpis.missedInRange} still missed`}
              value={kpis.completedInRange}
              icon={Target}
              theme={KPI_THEMES.target}
            />
            <AnalyticsKpiCard
              label="Sunnah"
              sub={`${kpis.sunnahInRange} with · ${kpis.sunnahWithoutInRange} without (${pct(kpis.sunnahInRange, kpis.completedInRange)}% with)`}
              value={kpis.sunnahInRange}
              icon={CheckCircle2}
              theme={KPI_THEMES.year}
            />
            <AnalyticsKpiCard
              label="Tasbeeh"
              sub={`${kpis.tasbeehInRange} with · ${kpis.tasbeehWithoutInRange} without (${pct(kpis.tasbeehInRange, kpis.completedInRange)}% with)`}
              value={kpis.tasbeehInRange}
              icon={Sparkles}
              theme={KPI_THEMES.month}
            />
            <AnalyticsKpiCard
              label="With Zamaat"
              sub={`${kpis.zamaatInRange} with · ${kpis.zamaatWithoutInRange} without (${pct(kpis.zamaatInRange, kpis.completedInRange)}% with)`}
              value={kpis.zamaatInRange}
              icon={Users}
              theme={KPI_THEMES.range}
            />
            <AnalyticsKpiCard
              label="Kaza"
              sub={prayerName ? `Made-up · ${prayerName}` : "Made-up prayers"}
              value={kpis.kazaInRange}
              icon={History}
              theme={KPI_THEMES.week}
            />
            <AnalyticsKpiCard
              label="Completion"
              sub="Past days filled"
              value={`${kpis.completionPct}%`}
              icon={CalendarRange}
              theme={KPI_THEMES.month}
            />
            <AnalyticsKpiCard
              label="Streak"
              sub="Full days in a row"
              value={kpis.streak}
              icon={Flame}
              theme={KPI_THEMES.year}
            />
          </div>

          {(focus === "overview" || focus === "extras") && (
            <>
              <div className="grid gap-4 xl:grid-cols-2">
                <TrendChartShell
                  title={
                    prayerName
                      ? `Daily on-time · ${prayerName}`
                      : "Daily on-time prayers"
                  }
                  chartHeight={300}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={daily}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={CHART_GRID_STROKE}
                      />
                      <XAxis
                        dataKey="dayLabel"
                        tick={CHART_TICK}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={CHART_TICK}
                        domain={[0, yMaxCompletion]}
                      />
                      <Tooltip {...CHART_TOOLTIP_STYLE} />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="prayed"
                        name="On time"
                        stroke={EXTRA_COLORS.onTime}
                        fill={EXTRA_COLORS.onTime}
                        fillOpacity={0.25}
                        strokeWidth={2}
                      />
                      <Area
                        type="monotone"
                        dataKey="completed"
                        name="Completed (incl. Kaza)"
                        stroke="#64748b"
                        fill="#64748b"
                        fillOpacity={0.12}
                        strokeWidth={1.5}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </TrendChartShell>

                <TrendChartShell
                  title={
                    prayerName
                      ? `Daily completion mix · ${prayerName}`
                      : "Daily on-time / Kaza / missed"
                  }
                  chartHeight={300}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={daily} stackOffset="none">
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={CHART_GRID_STROKE}
                      />
                      <XAxis
                        dataKey="dayLabel"
                        tick={CHART_TICK}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={CHART_TICK}
                        domain={[0, yMaxCompletion]}
                      />
                      <Tooltip {...CHART_TOOLTIP_STYLE} />
                      <Legend />
                      <Bar
                        dataKey="prayed"
                        name="On time"
                        stackId="mix"
                        fill={EXTRA_COLORS.onTime}
                        radius={[0, 0, 0, 0]}
                      />
                      <Bar
                        dataKey="kaza"
                        name="Kaza"
                        stackId="mix"
                        fill={EXTRA_COLORS.kaza}
                      />
                      <Bar
                        dataKey="missed"
                        name="Missed"
                        stackId="mix"
                        fill={EXTRA_COLORS.missed}
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </TrendChartShell>
              </div>

              <div className="grid gap-4 xl:grid-cols-3">
                {(
                  [
                    {
                      key: "sunnah",
                      title: "Sunnah · with vs without",
                      withKey: "sunnahWith",
                      withoutKey: "sunnahWithout",
                      withFill: EXTRA_COLORS.sunnah,
                    },
                    {
                      key: "tasbeeh",
                      title: "Tasbeeh · with vs without",
                      withKey: "tasbeehWith",
                      withoutKey: "tasbeehWithout",
                      withFill: EXTRA_COLORS.tasbeeh,
                    },
                    {
                      key: "zamaat",
                      title: "Zamaat · with vs without",
                      withKey: "zamaatWith",
                      withoutKey: "zamaatWithout",
                      withFill: EXTRA_COLORS.zamaat,
                    },
                  ] as const
                ).map((chart) => (
                  <TrendChartShell
                    key={chart.key}
                    title={
                      prayerName
                        ? `${chart.title} · ${prayerName}`
                        : chart.title
                    }
                    chartHeight={260}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={daily}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke={CHART_GRID_STROKE}
                        />
                        <XAxis
                          dataKey="dayLabel"
                          tick={CHART_TICK}
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          allowDecimals={false}
                          tick={CHART_TICK}
                          domain={[0, yMaxCompletion]}
                        />
                        <Tooltip {...CHART_TOOLTIP_STYLE} />
                        <Legend />
                        <Bar
                          dataKey={chart.withKey}
                          name="With"
                          stackId="extra"
                          fill={chart.withFill}
                        />
                        <Bar
                          dataKey={chart.withoutKey}
                          name="Without"
                          stackId="extra"
                          fill={EXTRA_COLORS.without}
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </TrendChartShell>
                ))}
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <TrendChartShell
                  title="Extras share (completed prayers)"
                  chartHeight={280}
                >
                  <div className="grid h-full grid-cols-1 gap-2 sm:grid-cols-3">
                    {(
                      [
                        { title: "Sunnah", data: sunnahPie },
                        { title: "Tasbeeh", data: tasbeehPie },
                        { title: "Zamaat", data: zamaatPie },
                      ] as const
                    ).map((pie) => (
                      <div key={pie.title} className="flex min-h-[12rem] flex-col">
                        <p className="mb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {pie.title}
                        </p>
                        {pie.data.length === 0 ? (
                          <p className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
                            No completed prayers
                          </p>
                        ) : (
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={pie.data}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                innerRadius={36}
                                outerRadius={58}
                                paddingAngle={2}
                              >
                                {pie.data.map((entry) => (
                                  <Cell key={entry.name} fill={entry.fill} />
                                ))}
                              </Pie>
                              <Tooltip {...CHART_TOOLTIP_STYLE} />
                            </PieChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    ))}
                  </div>
                </TrendChartShell>

                <TrendChartShell
                  title={
                    prayerName
                      ? `Extras by prayer · ${prayerName}`
                      : "Extras by prayer (with counts)"
                  }
                  chartHeight={280}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byPrayerExtras} layout="vertical">
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={CHART_GRID_STROKE}
                      />
                      <XAxis type="number" allowDecimals={false} tick={CHART_TICK} />
                      <YAxis
                        type="category"
                        dataKey="label"
                        width={64}
                        tick={CHART_TICK}
                      />
                      <Tooltip {...CHART_TOOLTIP_STYLE} />
                      <Legend />
                      <Bar
                        dataKey="sunnah"
                        name="Sunnah"
                        fill={EXTRA_COLORS.sunnah}
                        radius={[0, 4, 4, 0]}
                      />
                      <Bar
                        dataKey="tasbeeh"
                        name="Tasbeeh"
                        fill={EXTRA_COLORS.tasbeeh}
                        radius={[0, 4, 4, 0]}
                      />
                      <Bar
                        dataKey="zamaat"
                        name="Zamaat"
                        fill={EXTRA_COLORS.zamaat}
                        radius={[0, 4, 4, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </TrendChartShell>
              </div>

              <TrendChartShell
                title={
                  prayerName
                    ? `Daily extras trend · ${prayerName}`
                    : "Daily extras trend (with counts)"
                }
                chartHeight={280}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={daily}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={CHART_GRID_STROKE}
                    />
                    <XAxis
                      dataKey="dayLabel"
                      tick={CHART_TICK}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={CHART_TICK}
                      domain={[0, yMaxCompletion]}
                    />
                    <Tooltip {...CHART_TOOLTIP_STYLE} />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="sunnahWith"
                      name="Sunnah"
                      stroke={EXTRA_COLORS.sunnah}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="tasbeehWith"
                      name="Tasbeeh"
                      stroke={EXTRA_COLORS.tasbeeh}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="zamaatWith"
                      name="Zamaat"
                      stroke={EXTRA_COLORS.zamaat}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </TrendChartShell>
            </>
          )}

          {(focus === "overview" || focus === "extras") && (
            <AppDataTable
              title="Day-by-day practice report"
              totalCount={dailyNewestFirst.length}
            >
              <thead>
                <tr className={tableHeadRowClass}>
                  <th className={tableHeadCellClass}>Day</th>
                  <th className={tableHeadCellClass}>Date</th>
                  <th className={tableHeadCellClass}>On time</th>
                  <th className={tableHeadCellClass}>Kaza</th>
                  <th className={tableHeadCellClass}>Missed</th>
                  <th className={tableHeadCellClass}>Sunnah</th>
                  <th className={tableHeadCellClass}>Tasbeeh</th>
                  <th className={tableHeadCellClass}>Zamaat</th>
                </tr>
              </thead>
              <tbody>
                {dailyNewestFirst.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-10 text-center text-sm text-muted-foreground"
                    >
                      No days in this range.
                    </td>
                  </tr>
                ) : (
                  dailyNewestFirst.map((d) => (
                    <tr key={d.date} className={tableBodyRowClass}>
                      <td className={tableBodyCellClass}>
                        <span className="font-semibold">{d.weekday}</span>
                      </td>
                      <td className={cn(tableBodyCellClass, "tabular-nums")}>
                        {d.date}
                      </td>
                      <td className={cn(tableBodyCellClass, "tabular-nums font-semibold text-emerald-700 dark:text-emerald-300")}>
                        {d.prayed}
                      </td>
                      <td className={cn(tableBodyCellClass, "tabular-nums text-amber-800 dark:text-amber-200")}>
                        {d.kaza}
                      </td>
                      <td className={cn(tableBodyCellClass, "tabular-nums text-rose-700 dark:text-rose-300")}>
                        {d.missed}
                      </td>
                      <td className={tableBodyCellClass}>
                        <span className="text-xs tabular-nums">
                          <span className="font-semibold text-teal-700 dark:text-teal-300">
                            {d.sunnahWith}
                          </span>
                          <span className="text-muted-foreground">
                            {" "}
                            with · {d.sunnahWithout} without
                          </span>
                        </span>
                      </td>
                      <td className={tableBodyCellClass}>
                        <span className="text-xs tabular-nums">
                          <span className="font-semibold text-violet-700 dark:text-violet-300">
                            {d.tasbeehWith}
                          </span>
                          <span className="text-muted-foreground">
                            {" "}
                            with · {d.tasbeehWithout} without
                          </span>
                        </span>
                      </td>
                      <td className={tableBodyCellClass}>
                        <span className="text-xs tabular-nums">
                          <span className="font-semibold text-blue-700 dark:text-blue-300">
                            {d.zamaatWith}
                          </span>
                          <span className="text-muted-foreground">
                            {" "}
                            with · {d.zamaatWithout} without
                          </span>
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </AppDataTable>
          )}

          {(focus === "overview" || focus === "misses") && (
            <div className="grid gap-4 xl:grid-cols-2">
              <AppDataTable
                title="Outstanding misses (Kaza queue)"
                totalCount={data.missed.length}
              >
                <thead>
                  <tr className={tableHeadRowClass}>
                    <th className={tableHeadCellClass}>Day</th>
                    <th className={tableHeadCellClass}>Date</th>
                    <th className={tableHeadCellClass}>Prayer</th>
                  </tr>
                </thead>
                <tbody>
                  {data.missed.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-4 py-10 text-center text-sm text-muted-foreground"
                      >
                        No outstanding misses in this range.
                      </td>
                    </tr>
                  ) : (
                    data.missed.map((m) => (
                      <tr
                        key={`${m.date}-${m.prayer}`}
                        className={tableBodyRowClass}
                      >
                        <td className={tableBodyCellClass}>
                          <span className="font-semibold">{m.dayLabel}</span>
                        </td>
                        <td className={cn(tableBodyCellClass, "tabular-nums")}>
                          {m.date}
                        </td>
                        <td className={tableBodyCellClass}>
                          <span className="inline-flex rounded-full bg-rose-500/15 px-2.5 py-1 text-xs font-bold text-rose-700 dark:text-rose-300">
                            {m.label}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </AppDataTable>

              <AppDataTable
                title="Completed via Kaza"
                totalCount={data.kazaLog.length}
              >
                <thead>
                  <tr className={tableHeadRowClass}>
                    <th className={tableHeadCellClass}>Day</th>
                    <th className={tableHeadCellClass}>Original date</th>
                    <th className={tableHeadCellClass}>Prayer</th>
                    <th className={tableHeadCellClass}>Extras</th>
                  </tr>
                </thead>
                <tbody>
                  {data.kazaLog.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-10 text-center text-sm text-muted-foreground"
                      >
                        No Kaza completions in this range yet.
                      </td>
                    </tr>
                  ) : (
                    data.kazaLog.map((m) => (
                      <tr
                        key={`${m.date}-${m.prayer}-kaza`}
                        className={tableBodyRowClass}
                      >
                        <td className={tableBodyCellClass}>
                          <span className="font-semibold">{m.dayLabel}</span>
                        </td>
                        <td className={cn(tableBodyCellClass, "tabular-nums")}>
                          {m.date}
                        </td>
                        <td className={tableBodyCellClass}>
                          <span className="inline-flex rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-bold text-amber-800 dark:text-amber-200">
                            {m.label} · Kaza
                          </span>
                        </td>
                        <td className={tableBodyCellClass}>
                          <div className="flex flex-wrap gap-1">
                            <FlagPill on={m.sunnah} label="Sunnah" />
                            <FlagPill on={m.tasbeeh} label="Tasbeeh" />
                            <FlagPill on={m.zamaat} label="Zamaat" />
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </AppDataTable>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
