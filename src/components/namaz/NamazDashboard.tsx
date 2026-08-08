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
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
  { key: "custom", label: "Custom" },
];

export function NamazDashboard({ refreshKey = 0 }: { refreshKey?: number }) {
  const baseline = resolveAnalyticsQuickRange("today");
  const [quick, setQuick] = useState<AnalyticsQuickRange>("today");
  const [from, setFrom] = useState(baseline.from);
  const [to, setTo] = useState(baseline.to);
  const [prayerFilter, setPrayerFilter] = useState("");
  const [data, setData] = useState<NamazAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const trackingStart = getTrackingStartDate();

  const hasActiveFilters =
    Boolean(prayerFilter) ||
    hasActiveAnalyticsRangeFilter(quick, from, to, "today");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ range: quick, from, to });
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
  }, [quick, from, to]);

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
  }

  const prayerName = prayerFilter
    ? NAMAZ_PRAYER_META[prayerFilter as NamazPrayer]?.label
    : null;

  const filteredByPrayer = useMemo(() => {
    if (!data) return [];
    if (!prayerFilter) return data.byPrayer;
    return data.byPrayer.filter((p) => p.prayer === prayerFilter);
  }, [data, prayerFilter]);

  const filteredMissed = useMemo(() => {
    if (!data) return [];
    if (!prayerFilter) return data.missed;
    return data.missed.filter((m) => m.prayer === prayerFilter);
  }, [data, prayerFilter]);

  const filteredKazaLog = useMemo(() => {
    if (!data) return [];
    if (!prayerFilter) return data.kazaLog;
    return data.kazaLog.filter((m) => m.prayer === prayerFilter);
  }, [data, prayerFilter]);

  const filteredKpis = useMemo(() => {
    if (!data) return null;
    if (!prayerFilter) return data.kpis;
    const row = data.byPrayer.find((p) => p.prayer === prayerFilter);
    if (!row) return data.kpis;
    const completed = row.prayed + row.kaza;
    const expected = completed + row.missed;
    return {
      ...data.kpis,
      prayedInRange: row.prayed,
      kazaInRange: row.kaza,
      completedInRange: completed,
      missedInRange: row.missed,
      sunnahInRange: row.sunnah,
      tasbeehInRange: row.tasbeeh,
      completionPct:
        expected > 0
          ? Math.round((completed / expected) * 1000) / 10
          : data.kpis.completionPct,
    };
  }, [data, prayerFilter]);

  return (
    <section className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-300">
          Namaz dashboard
        </p>
        <h2 className="mt-0.5 text-xl font-bold tracking-tight">
          Consistency & misses
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Tracking starts {trackingStartLabel(trackingStart)}. Outstanding
          misses stay in the Kaza queue until made up; completed Kaza appears
          separately in analytics.
        </p>
      </div>

      {/* Same filter shell pattern as main Dashboard */}
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
            <p className="mt-1 text-[10px] text-muted-foreground">
              Scopes KPIs, charts, and tables below.
            </p>
          </div>
          {hasActiveFilters ? (
            <ClearFiltersButton onClick={resetFilters} />
          ) : null}
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
      ) : data && filteredKpis ? (
        <>
          {prayerName ? (
            <p className="text-xs">
              <span className="inline-flex items-center rounded-full bg-teal-500/15 px-2.5 py-0.5 font-semibold text-teal-800 dark:text-teal-200">
                Filtered · {prayerName}
              </span>
            </p>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <AnalyticsKpiCard
              label="On time"
              sub={
                prayerName
                  ? `Fard on time · ${prayerName}`
                  : "Fard logged same day"
              }
              value={filteredKpis.prayedInRange}
              icon={CheckCircle2}
              theme={KPI_THEMES.today}
            />
            <AnalyticsKpiCard
              label="Kaza"
              sub={
                prayerName
                  ? `Made-up · ${prayerName}`
                  : "Made-up past prayers"
              }
              value={filteredKpis.kazaInRange}
              icon={History}
              theme={KPI_THEMES.week}
            />
            <AnalyticsKpiCard
              label="Still missed"
              sub={prayerName ? `Awaiting Kaza · ${prayerName}` : "Awaiting Kaza"}
              value={filteredKpis.missedInRange}
              icon={Target}
              theme={KPI_THEMES.target}
            />
            <AnalyticsKpiCard
              label="Completion"
              sub="Past days filled"
              value={`${filteredKpis.completionPct}%`}
              icon={CalendarRange}
              theme={KPI_THEMES.month}
            />
            <AnalyticsKpiCard
              label="Streak"
              sub="Full days in a row"
              value={filteredKpis.streak}
              icon={Flame}
              theme={KPI_THEMES.year}
            />
            <AnalyticsKpiCard
              label="Sunnah / Tasbeeh"
              sub={`${filteredKpis.sunnahInRange} sunnah · ${filteredKpis.tasbeehInRange} tasbeeh`}
              value={
                filteredKpis.sunnahInRange + filteredKpis.tasbeehInRange
              }
              icon={Sparkles}
              theme={KPI_THEMES.range}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <TrendChartShell
              title={
                prayerName
                  ? `Daily on-time / kaza / missed · ${prayerName}`
                  : "Daily on-time / kaza / missed"
              }
              chartHeight={280}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.daily}>
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
                    domain={[0, prayerFilter ? 1 : 5]}
                  />
                  <Tooltip {...CHART_TOOLTIP_STYLE} />
                  <Legend />
                  <Bar
                    dataKey="prayed"
                    name="On time"
                    fill="#059669"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="kaza"
                    name="Kaza"
                    fill="#d97706"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="missed"
                    name="Missed"
                    fill="#e11d48"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </TrendChartShell>

            <TrendChartShell
              title={
                prayerName
                  ? `By prayer · ${prayerName}`
                  : "By prayer (range)"
              }
              chartHeight={280}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={filteredByPrayer}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={CHART_GRID_STROKE}
                  />
                  <XAxis dataKey="label" tick={CHART_TICK} />
                  <YAxis allowDecimals={false} tick={CHART_TICK} />
                  <Tooltip {...CHART_TOOLTIP_STYLE} />
                  <Legend />
                  <Bar
                    dataKey="prayed"
                    name="On time"
                    fill="#0d9488"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="kaza"
                    name="Kaza"
                    fill="#d97706"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="missed"
                    name="Still missed"
                    fill="#f43f5e"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </TrendChartShell>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <AppDataTable
              title="Outstanding misses (Kaza queue)"
              totalCount={filteredMissed.length}
            >
              <thead>
                <tr className={tableHeadRowClass}>
                  <th className={tableHeadCellClass}>Day</th>
                  <th className={tableHeadCellClass}>Date</th>
                  <th className={tableHeadCellClass}>Prayer</th>
                </tr>
              </thead>
              <tbody>
                {filteredMissed.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-4 py-10 text-center text-sm text-muted-foreground"
                    >
                      No outstanding misses in this range.
                    </td>
                  </tr>
                ) : (
                  filteredMissed.map((m) => (
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
              totalCount={filteredKazaLog.length}
            >
              <thead>
                <tr className={tableHeadRowClass}>
                  <th className={tableHeadCellClass}>Day</th>
                  <th className={tableHeadCellClass}>Original date</th>
                  <th className={tableHeadCellClass}>Prayer</th>
                </tr>
              </thead>
              <tbody>
                {filteredKazaLog.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-4 py-10 text-center text-sm text-muted-foreground"
                    >
                      No Kaza completions in this range yet.
                    </td>
                  </tr>
                ) : (
                  filteredKazaLog.map((m) => (
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
                    </tr>
                  ))
                )}
              </tbody>
            </AppDataTable>
          </div>
        </>
      ) : null}
    </section>
  );
}
