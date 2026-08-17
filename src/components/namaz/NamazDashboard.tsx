"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlarmClock,
  CalendarRange,
  CheckCircle2,
  Flame,
  History,
  Loader2,
  Sparkles,
  TriangleAlert,
  Trophy,
} from "lucide-react";
import { api } from "@/lib/client-api";
import type { AnalyticsQuickRange } from "@/lib/date-ranges";
import {
  resolveAnalyticsQuickRange,
  trackingStartLabel,
} from "@/lib/date-ranges";
import { hasActiveAnalyticsRangeFilter } from "@/lib/filter-utils";
import { NAMAZ_PRAYERS, NAMAZ_PRAYER_META, type NamazPrayer } from "@/lib/namaz";
import type { NamazAnalyticsResponse } from "@/types";
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
const LineChart = dynamic(() => import("recharts").then((m) => m.LineChart), {
  ssr: false,
});
const Line = dynamic(() => import("recharts").then((m) => m.Line), {
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

const RANGE_PILLS: { key: AnalyticsQuickRange; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "7 days" },
  { key: "last30", label: "30 days" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
  { key: "custom", label: "Custom" },
];

const MIX_COLORS = {
  onTime: SEMANTIC_COLORS.positive,
  kaza: SEMANTIC_COLORS.warning,
  missed: SEMANTIC_COLORS.negative,
  grace: SEMANTIC_COLORS.neutral,
} as const;

const EXTRA_COLORS = {
  sunnah: SEMANTIC_COLORS.accent,
  tasbeeh: SEMANTIC_COLORS.violet,
  zamaat: SEMANTIC_COLORS.info,
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
  const baseline = resolveAnalyticsQuickRange("week");
  const [quick, setQuick] = useState<AnalyticsQuickRange>("week");
  const [from, setFrom] = useState(baseline.from);
  const [to, setTo] = useState(baseline.to);
  const [prayerFilter, setPrayerFilter] = useState("");
  const [focus, setFocus] = useState<ReportFocus>("overview");
  const [data, setData] = useState<NamazAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Authoritative per-account start; the server clamps every range to it. */
  const trackingStart = data?.trackingStart ?? null;

  const hasActiveFilters =
    Boolean(prayerFilter) ||
    focus !== "overview" ||
    hasActiveAnalyticsRangeFilter(quick, from, to, "week");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ range: quick, from, to });
      if (prayerFilter) params.set("prayer", prayerFilter);
      setData(
        await api<NamazAnalyticsResponse>(`/api/namaz/analytics?${params}`)
      );
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
    const range = resolveAnalyticsQuickRange("week");
    setQuick("week");
    setFrom(range.from);
    setTo(range.to);
    setPrayerFilter("");
    setFocus("overview");
  }

  const prayerName = prayerFilter
    ? NAMAZ_PRAYER_META[prayerFilter as NamazPrayer]?.label
    : null;

  const kpis = data?.kpis ?? null;
  const daily = useMemo(() => data?.daily ?? [], [data]);
  const slotsPerDay = prayerFilter ? 1 : NAMAZ_PRAYERS.length;

  const heatmapDays: HeatmapDay[] = useMemo(
    () =>
      daily.map((d) => ({
        date: d.date,
        intensity: d.isFinalized || d.completed > 0 ? d.completed / d.slots : -1,
        title: `${d.date} · ${d.prayed} on time, ${d.kaza} kaza, ${d.missed} missed`,
      })),
    [daily]
  );

  const prayerRates = useMemo(() => {
    if (!data) return [];
    const rows = prayerFilter
      ? data.byPrayer.filter((p) => p.prayer === prayerFilter)
      : data.byPrayer;
    return rows.map((p) => ({
      label: p.label,
      pct: p.onTimePct,
      caption: `${p.prayed} on time · ${p.kaza} kaza · ${p.missed} missed`,
      color:
        p.onTimePct >= 80
          ? SEMANTIC_COLORS.positive
          : p.onTimePct >= 50
            ? SEMANTIC_COLORS.warning
            : SEMANTIC_COLORS.negative,
    }));
  }, [data, prayerFilter]);

  const extraRates = useMemo(() => {
    if (!data) return [];
    const completed = data.kpis.completedInRange;
    return [
      {
        label: "Sunnah",
        pct: pct(data.extrasShare.sunnah.with, completed),
        caption: `${data.extrasShare.sunnah.with} of ${completed} prayers`,
        color: EXTRA_COLORS.sunnah,
      },
      {
        label: "Tasbeeh",
        pct: pct(data.extrasShare.tasbeeh.with, completed),
        caption: `${data.extrasShare.tasbeeh.with} of ${completed} prayers`,
        color: EXTRA_COLORS.tasbeeh,
      },
      {
        label: "Zamaat",
        pct: pct(data.extrasShare.zamaat.with, completed),
        caption: `${data.extrasShare.zamaat.with} of ${completed} prayers`,
        color: EXTRA_COLORS.zamaat,
      },
    ];
  }, [data]);

  const strongest = useMemo(
    () =>
      prayerRates.length
        ? prayerRates.reduce((a, b) => (b.pct > a.pct ? b : a))
        : null,
    [prayerRates]
  );
  const weakest = useMemo(
    () =>
      prayerRates.length
        ? prayerRates.reduce((a, b) => (b.pct < a.pct ? b : a))
        : null,
    [prayerRates]
  );

  const dailyNewestFirst = useMemo(() => [...daily].reverse(), [daily]);

  return (
    <section className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-teal-800 dark:text-teal-300">
          Insights
        </p>
        <h2 className="mt-0.5 text-xl font-bold tracking-tight">
          Prayer practice analytics
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Rates are measured over days that have finished — today is still open,
          so it never counts against you.
          {trackingStart
            ? ` Nothing before ${trackingStartLabel(trackingStart)} is counted, so days from before you started tracking never appear as misses.`
            : null}
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
              minIso={trackingStart ?? undefined}
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
                <SelectItem value="extras">Sunnah · Tasbeeh · Zamaat</SelectItem>
                <SelectItem value="misses">Misses &amp; Kaza</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {hasActiveFilters ? (
            <ClearFiltersButton onClick={resetFilters} />
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-[11px] text-muted-foreground">
          <span className="font-semibold text-foreground">
            {from} → {to}
          </span>
          {prayerName ? (
            <span className="inline-flex items-center rounded-full bg-teal-500/15 px-2.5 py-0.5 font-semibold text-teal-800 dark:text-teal-200">
              {prayerName} only
            </span>
          ) : null}
          <span className="ml-auto">
            {kpis?.finalizedExpected ?? 0} finished slots in range
          </span>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading namaz analytics...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-400 bg-rose-500/12 p-6 text-sm font-medium text-rose-800 dark:border-rose-400/40 dark:bg-rose-400/12 dark:text-rose-200">
          {error}
        </div>
      ) : data && kpis ? (
        <>
          {/* Hero: the two numbers that matter, then supporting tiles. */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_1fr]">
            <SectionCard
              title="On-time rate"
              description="Finished days only"
              bodyClassName="flex items-center justify-center py-6"
            >
              <ProgressRing
                value={kpis.onTimePct}
                label="On time"
                color={
                  kpis.onTimePct >= 80
                    ? SEMANTIC_COLORS.positive
                    : kpis.onTimePct >= 50
                      ? SEMANTIC_COLORS.warning
                      : SEMANTIC_COLORS.negative
                }
                caption={`${kpis.prayedInRange} of ${kpis.finalizedExpected} expected prayers offered inside their window. ${kpis.completionPct}% completed once Kaza is counted.`}
              />
            </SectionCard>

            <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
              <StatTile
                label="Current streak"
                value={kpis.streak}
                sub={`Best ${kpis.bestStreak} · full days in a row`}
                icon={Flame}
                accent="amber"
              />
              <StatTile
                label="On time"
                value={kpis.prayedInRange}
                sub={prayerName ? `${prayerName} in window` : "Inside the window"}
                icon={CheckCircle2}
                accent="emerald"
                progress={kpis.onTimePct}
              />
              <StatTile
                label="Kaza"
                value={kpis.kazaInRange}
                sub="Completed after the window"
                icon={History}
                accent="amber"
              />
              <StatTile
                label="Still missed"
                value={kpis.missedInRange}
                sub="Past days awaiting Kaza"
                icon={TriangleAlert}
                accent={kpis.missedInRange > 0 ? "rose" : "slate"}
              />
              <StatTile
                label="Unmarked today"
                value={kpis.graceTodayCount}
                sub="Closed windows still recordable"
                icon={AlarmClock}
                accent={kpis.graceTodayCount > 0 ? "rose" : "slate"}
              />
              <StatTile
                label="Completion"
                value={`${kpis.completionPct}%`}
                sub="Past days filled, incl. Kaza"
                icon={CalendarRange}
                accent="violet"
                progress={kpis.completionPct}
              />
            </div>
          </div>

          {(focus === "overview" || focus === "misses") && (
            <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
              <SectionCard
                title="Consistency"
                description="One square per day — darker means more of that day was completed"
              >
                <ConsistencyHeatmap
                  days={heatmapDays}
                  legendLow="0"
                  legendHigh={`${slotsPerDay}`}
                />
              </SectionCard>

              <SectionCard
                title={prayerName ? `On-time rate · ${prayerName}` : "On-time rate by prayer"}
                description="Share of finished days each prayer was offered in its window"
              >
                <RateBars rows={prayerRates} />
                {strongest && weakest && strongest.label !== weakest.label ? (
                  <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-3">
                    <div className="rounded-lg bg-emerald-500/12 px-2.5 py-2 dark:bg-emerald-400/12">
                      <p className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                        <Trophy className="h-3 w-3" /> Strongest
                      </p>
                      <p className="mt-0.5 text-sm font-bold">
                        {strongest.label}{" "}
                        <span className="tabular-nums text-muted-foreground">
                          {strongest.pct}%
                        </span>
                      </p>
                    </div>
                    <div className="rounded-lg bg-rose-500/12 px-2.5 py-2 dark:bg-rose-400/12">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-rose-800 dark:text-rose-300">
                        Needs attention
                      </p>
                      <p className="mt-0.5 text-sm font-bold">
                        {weakest.label}{" "}
                        <span className="tabular-nums text-muted-foreground">
                          {weakest.pct}%
                        </span>
                      </p>
                    </div>
                  </div>
                ) : null}
              </SectionCard>
            </div>
          )}

          {(focus === "overview" || focus === "misses") && (
            <ChartCard
              title={
                prayerName
                  ? `Daily outcome · ${prayerName}`
                  : "Daily outcome mix"
              }
              description="Every slot of every day, by how it was completed"
              height={300}
              action={
                <ChartLegend
                  items={[
                    { label: "On time", color: MIX_COLORS.onTime },
                    { label: "Kaza", color: MIX_COLORS.kaza },
                    { label: "Missed", color: MIX_COLORS.missed },
                    { label: "Unmarked today", color: MIX_COLORS.grace },
                  ]}
                />
              }
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={daily} margin={{ top: 8, right: 8, left: 0 }}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={CHART_GRID_STROKE}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="dayLabel"
                    tick={CHART_TICK}
                    interval="preserveStartEnd"
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={CHART_TICK}
                    domain={[0, slotsPerDay]}
                    tickLine={false}
                    axisLine={false}
                    width={28}
                  />
                  <Tooltip {...CHART_TOOLTIP_STYLE} />
                  <Bar dataKey="prayed" name="On time" stackId="mix" fill={MIX_COLORS.onTime} />
                  <Bar dataKey="kaza" name="Kaza" stackId="mix" fill={MIX_COLORS.kaza} />
                  <Bar dataKey="missed" name="Missed" stackId="mix" fill={MIX_COLORS.missed} />
                  <Bar
                    dataKey="grace"
                    name="Unmarked today"
                    stackId="mix"
                    fill={MIX_COLORS.grace}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {(focus === "overview" || focus === "extras") && (
            <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
              <SectionCard
                title="Extras adherence"
                description="Share of completed prayers that included each extra"
              >
                <RateBars
                  rows={extraRates}
                  emptyLabel="No completed prayers in this range"
                />
                <p className="mt-4 border-t border-border pt-3 text-[11px] text-muted-foreground">
                  Checked extras count as <strong>with</strong>; completed
                  prayers left unchecked count as <strong>without</strong>.
                </p>
              </SectionCard>

              <ChartCard
                title={
                  prayerName
                    ? `Daily extras · ${prayerName}`
                    : "Daily extras trend"
                }
                description="Prayers performed with each extra, per day"
                height={280}
                action={
                  <ChartLegend
                    items={[
                      { label: "Sunnah", color: EXTRA_COLORS.sunnah },
                      { label: "Tasbeeh", color: EXTRA_COLORS.tasbeeh },
                      { label: "Zamaat", color: EXTRA_COLORS.zamaat },
                    ]}
                  />
                }
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={daily} margin={{ top: 8, right: 8, left: 0 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={CHART_GRID_STROKE}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="dayLabel"
                      tick={CHART_TICK}
                      interval="preserveStartEnd"
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={CHART_TICK}
                      domain={[0, slotsPerDay]}
                      tickLine={false}
                      axisLine={false}
                      width={28}
                    />
                    <Tooltip {...CHART_TOOLTIP_STYLE} />
                    <Line
                      type="monotone"
                      dataKey="sunnahWith"
                      name="Sunnah"
                      stroke={EXTRA_COLORS.sunnah}
                      strokeWidth={2.5}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="tasbeehWith"
                      name="Tasbeeh"
                      stroke={EXTRA_COLORS.tasbeeh}
                      strokeWidth={2.5}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="zamaatWith"
                      name="Zamaat"
                      stroke={EXTRA_COLORS.zamaat}
                      strokeWidth={2.5}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          )}

          {(focus === "overview" || focus === "extras") && (
            <AppDataTable
              title="Day-by-day practice report"
              totalCount={dailyNewestFirst.length}
              empty="No days in this range."
            >
              <thead>
                <tr className={tableHeadRowClass}>
                  <th className={tableHeadCellClass}>Day</th>
                  <th className={tableHeadCellClass}>Date</th>
                  <th className={tableHeadCellClass}>On time</th>
                  <th className={tableHeadCellClass}>Kaza</th>
                  <th className={tableHeadCellClass}>Missed</th>
                  <th className={tableHeadCellClass}>Completed</th>
                  <th className={tableHeadCellClass}>Sunnah</th>
                  <th className={tableHeadCellClass}>Tasbeeh</th>
                  <th className={tableHeadCellClass}>Zamaat</th>
                </tr>
              </thead>
              <tbody>
                {dailyNewestFirst.map((d) => (
                  <tr key={d.date} className={tableBodyRowClass}>
                    <td className={tableBodyCellClass}>
                      <span className="font-semibold">{d.weekday}</span>
                    </td>
                    <td className={cn(tableBodyCellClass, "tabular-nums")}>
                      {d.date}
                    </td>
                    <td
                      className={cn(
                        tableBodyCellClass,
                        "tabular-nums font-semibold text-emerald-700 dark:text-emerald-300"
                      )}
                    >
                      {d.prayed}
                    </td>
                    <td
                      className={cn(
                        tableBodyCellClass,
                        "tabular-nums text-amber-800 dark:text-amber-200"
                      )}
                    >
                      {d.kaza}
                    </td>
                    <td
                      className={cn(
                        tableBodyCellClass,
                        "tabular-nums text-rose-700 dark:text-rose-300"
                      )}
                    >
                      {d.missed}
                      {d.grace > 0 ? (
                        <span className="ml-1 text-[10px] font-semibold text-muted-foreground">
                          (+{d.grace} open)
                        </span>
                      ) : null}
                    </td>
                    <td className={tableBodyCellClass}>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-teal-600 dark:bg-teal-400"
                            style={{ width: `${Math.min(100, d.completedPct)}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-semibold tabular-nums">
                          {d.completed}/{d.slots}
                        </span>
                      </div>
                    </td>
                    <td className={cn(tableBodyCellClass, "text-xs tabular-nums")}>
                      <span className="font-semibold text-teal-800 dark:text-teal-300">
                        {d.sunnahWith}
                      </span>
                      <span className="text-muted-foreground">
                        {" "}
                        / {d.sunnahWith + d.sunnahWithout}
                      </span>
                    </td>
                    <td className={cn(tableBodyCellClass, "text-xs tabular-nums")}>
                      <span className="font-semibold text-violet-700 dark:text-violet-300">
                        {d.tasbeehWith}
                      </span>
                      <span className="text-muted-foreground">
                        {" "}
                        / {d.tasbeehWith + d.tasbeehWithout}
                      </span>
                    </td>
                    <td className={cn(tableBodyCellClass, "text-xs tabular-nums")}>
                      <span className="font-semibold text-blue-700 dark:text-blue-300">
                        {d.zamaatWith}
                      </span>
                      <span className="text-muted-foreground">
                        {" "}
                        / {d.zamaatWith + d.zamaatWithout}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </AppDataTable>
          )}

          {(focus === "overview" || focus === "misses") && (
            <div className="grid gap-4 xl:grid-cols-2">
              <AppDataTable
                title="Outstanding misses (Kaza queue)"
                totalCount={data.missed.length}
                empty="No outstanding misses in this range."
              >
                <thead>
                  <tr className={tableHeadRowClass}>
                    <th className={tableHeadCellClass}>Day</th>
                    <th className={tableHeadCellClass}>Date</th>
                    <th className={tableHeadCellClass}>Prayer</th>
                    <th className={tableHeadCellClass}>Age</th>
                  </tr>
                </thead>
                <tbody>
                  {data.missed.map((m) => (
                    <tr key={`${m.date}-${m.prayer}`} className={tableBodyRowClass}>
                      <td className={tableBodyCellClass}>
                        <span className="font-semibold">{m.dayLabel}</span>
                      </td>
                      <td className={cn(tableBodyCellClass, "tabular-nums")}>
                        {m.date}
                      </td>
                      <td className={tableBodyCellClass}>
                        <span className="inline-flex rounded-full bg-rose-500/15 px-2.5 py-1 text-xs font-bold text-rose-800 dark:bg-rose-400/15 dark:text-rose-200">
                          {m.label}
                        </span>
                      </td>
                      <td
                        className={cn(
                          tableBodyCellClass,
                          "tabular-nums text-muted-foreground"
                        )}
                      >
                        {m.daysAgo}d
                      </td>
                    </tr>
                  ))}
                </tbody>
              </AppDataTable>

              <AppDataTable
                title="Completed via Kaza"
                totalCount={data.kazaLog.length}
                empty="No Kaza completions in this range yet."
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
                  {data.kazaLog.map((m) => (
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
                          {m.label}
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
                  ))}
                </tbody>
              </AppDataTable>
            </div>
          )}

          {kpis.finalizedExpected === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="No finished days in this range yet"
              description="Rates appear once a day has fully closed. Widen the range or come back tomorrow."
            />
          ) : null}
        </>
      ) : null}
    </section>
  );
}
