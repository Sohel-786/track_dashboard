"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Flame,
  History,
  Loader2,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { api } from "@/lib/client-api";
import type { AnalyticsQuickRange } from "@/lib/date-ranges";
import { resolveAnalyticsQuickRange } from "@/lib/date-ranges";
import { NAMAZ_PRAYERS, NAMAZ_PRAYER_META, type NamazPrayer } from "@/lib/namaz";
import type { NamazAnalyticsResponse } from "@/types";
import {
  ConsistencyHeatmap,
  EmptyState,
  ProgressRing,
  SectionCard,
  type HeatmapDay,
} from "@/components/dashboard/insight-widgets";
import {
  CHART_GRID_STROKE,
  CHART_TICK,
  CHART_TOOLTIP_STYLE,
  SEMANTIC_COLORS,
} from "@/components/dashboard/chart-theme";
import { AppDataTable } from "@/components/ui/AppDataTable";
import { DatePicker } from "@/components/ui/date-picker";
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

const RANGE_PILLS: { key: AnalyticsQuickRange; label: string }[] = [
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

function pct(part: number, whole: number) {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

function rateColor(value: number) {
  if (value >= 80) return SEMANTIC_COLORS.positive;
  if (value >= 50) return SEMANTIC_COLORS.warning;
  return SEMANTIC_COLORS.negative;
}

/** One headline number. No caption — the label and the value say it all. */
function MiniStat({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number | string;
  icon: typeof Flame;
  tone: "emerald" | "amber" | "rose" | "teal";
}) {
  const tones = {
    emerald: "bg-emerald-500/12 text-emerald-800 dark:text-emerald-300",
    amber: "bg-amber-500/12 text-amber-800 dark:text-amber-300",
    rose: "bg-rose-500/12 text-rose-800 dark:text-rose-300",
    teal: "bg-teal-500/12 text-teal-800 dark:text-teal-300",
  } as const;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          tones[tone]
        )}
      >
        <Icon className="h-4 w-4" strokeWidth={2.25} />
      </span>
      <div className="min-w-0">
        <p className="text-xl font-bold tabular-nums leading-none tracking-tight">
          {value}
        </p>
        <p className="mt-1 truncate text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
      </div>
    </div>
  );
}

/** Named percentage row — used for both per-prayer rates and extras. */
function RateRow({
  label,
  value,
  detail,
  color,
}: {
  label: string;
  value: number;
  detail: string;
  color: string;
}) {
  return (
    <li className="flex items-center gap-3">
      <span className="w-20 shrink-0 truncate text-sm font-semibold">
        {label}
      </span>
      <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full transition-all duration-500"
          style={{
            width: `${Math.min(100, Math.max(value > 0 ? 3 : 0, value))}%`,
            background: color,
          }}
        />
      </span>
      <span className="w-24 shrink-0 text-right text-xs font-bold tabular-nums">
        {detail}
      </span>
    </li>
  );
}

export function NamazDashboard({ refreshKey = 0 }: { refreshKey?: number }) {
  const baseline = resolveAnalyticsQuickRange("week");
  const [quick, setQuick] = useState<AnalyticsQuickRange>("week");
  const [from, setFrom] = useState(baseline.from);
  const [to, setTo] = useState(baseline.to);
  const [prayerFilter, setPrayerFilter] = useState("");
  const [data, setData] = useState<NamazAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const trackingStart = data?.trackingStart ?? null;

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
      setError(e instanceof Error ? e.message : "Failed to load analytics");
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

  const kpis = data?.kpis ?? null;
  const daily = useMemo(() => data?.daily ?? [], [data]);
  const slotsPerDay = prayerFilter ? 1 : NAMAZ_PRAYERS.length;

  const heatmapDays: HeatmapDay[] = useMemo(
    () =>
      daily.map((d) => ({
        date: d.date,
        intensity: d.isFinalized || d.completed > 0 ? d.completed / d.slots : -1,
        title: `${d.date} — ${d.prayed} on time, ${d.kaza} kaza, ${d.missed} missed`,
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
      value: p.onTimePct,
      detail: `${p.prayed}/${p.expected}`,
      color: rateColor(p.onTimePct),
    }));
  }, [data, prayerFilter]);

  const extraRates = useMemo(() => {
    if (!data) return [];
    const done = data.kpis.completedInRange;
    return [
      {
        label: "Sunnah",
        value: pct(data.extrasShare.sunnah.with, done),
        detail: `${data.extrasShare.sunnah.with}/${done}`,
        color: EXTRA_COLORS.sunnah,
      },
      {
        label: "Tasbeeh",
        value: pct(data.extrasShare.tasbeeh.with, done),
        detail: `${data.extrasShare.tasbeeh.with}/${done}`,
        color: EXTRA_COLORS.tasbeeh,
      },
      {
        label: "Zamaat",
        value: pct(data.extrasShare.zamaat.with, done),
        detail: `${data.extrasShare.zamaat.with}/${done}`,
        color: EXTRA_COLORS.zamaat,
      },
    ];
  }, [data]);

  const dailyNewestFirst = useMemo(() => [...daily].reverse(), [daily]);

  return (
    <section className="space-y-5">
      {/* One control bar: when, and which prayer. */}
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

        <div className="w-full sm:ml-auto sm:w-48">
          <Select
            value={prayerFilter || SELECT_ALL}
            onValueChange={(value) =>
              setPrayerFilter(value === SELECT_ALL ? "" : value)
            }
          >
            <SelectTrigger aria-label="Filter by prayer">
              <SelectValue placeholder="All prayers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SELECT_ALL}>All prayers</SelectItem>
              {NAMAZ_PRAYERS.map((prayer) => (
                <SelectItem key={prayer} value={prayer}>
                  {NAMAZ_PRAYER_META[prayer as NamazPrayer].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-400 bg-rose-500/12 p-6 text-sm font-medium text-rose-800 dark:border-rose-400/40 dark:bg-rose-400/12 dark:text-rose-200">
          {error}
        </div>
      ) : data && kpis ? (
        <>
          {/* The headline: one rate, then the four counts behind it. */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,17rem)_1fr]">
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
              <ProgressRing
                value={kpis.onTimePct}
                label="On time"
                color={rateColor(kpis.onTimePct)}
              />
              <p className="text-sm font-bold tabular-nums">
                {kpis.prayedInRange}
                <span className="text-muted-foreground">
                  {" "}
                  / {kpis.finalizedExpected}
                </span>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 xl:grid-cols-2">
              <MiniStat
                label="Streak"
                value={kpis.streak}
                icon={Flame}
                tone="amber"
              />
              <MiniStat
                label="On time"
                value={kpis.prayedInRange}
                icon={CheckCircle2}
                tone="emerald"
              />
              <MiniStat
                label="Kaza"
                value={kpis.kazaInRange}
                icon={History}
                tone="amber"
              />
              <MiniStat
                label="Missed"
                value={kpis.missedInRange}
                icon={TriangleAlert}
                tone={kpis.missedInRange > 0 ? "rose" : "teal"}
              />
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <SectionCard title="On time by prayer">
              {prayerRates.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nothing to show yet.
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {prayerRates.map((row) => (
                    <RateRow key={row.label} {...row} />
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard title="Consistency">
              <ConsistencyHeatmap
                days={heatmapDays}
                legendLow="0"
                legendHigh={`${slotsPerDay}`}
              />
            </SectionCard>
          </div>

          <SectionCard
            title="Each day"
            action={
              <div className="flex flex-wrap items-center gap-3 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                {[
                  { label: "On time", color: MIX_COLORS.onTime },
                  { label: "Kaza", color: MIX_COLORS.kaza },
                  { label: "Missed", color: MIX_COLORS.missed },
                  { label: "Open", color: MIX_COLORS.grace },
                ].map((item) => (
                  <span key={item.label} className="inline-flex items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 rounded-sm"
                      style={{ background: item.color }}
                    />
                    {item.label}
                  </span>
                ))}
              </div>
            }
          >
            <div className="h-[16rem] w-full">
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
                    width={26}
                  />
                  <Tooltip {...CHART_TOOLTIP_STYLE} />
                  <Bar
                    dataKey="prayed"
                    name="On time"
                    stackId="mix"
                    fill={MIX_COLORS.onTime}
                  />
                  <Bar
                    dataKey="kaza"
                    name="Kaza"
                    stackId="mix"
                    fill={MIX_COLORS.kaza}
                  />
                  <Bar
                    dataKey="missed"
                    name="Missed"
                    stackId="mix"
                    fill={MIX_COLORS.missed}
                  />
                  <Bar
                    dataKey="grace"
                    name="Open"
                    stackId="mix"
                    fill={MIX_COLORS.grace}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>

          <SectionCard title="Extras">
            <ul className="flex flex-col gap-3">
              {extraRates.map((row) => (
                <RateRow key={row.label} {...row} />
              ))}
            </ul>
          </SectionCard>

          <div className="grid gap-4 xl:grid-cols-2">
            <AppDataTable
              title="Kaza queue"
              totalCount={data.missed.length}
              empty="Nothing outstanding."
              minWidth={420}
            >
              <thead>
                <tr className={tableHeadRowClass}>
                  <th className={tableHeadCellClass}>Date</th>
                  <th className={tableHeadCellClass}>Prayer</th>
                  <th className={tableHeadCellClass}>Age</th>
                </tr>
              </thead>
              <tbody>
                {data.missed.map((m) => (
                  <tr key={`${m.date}-${m.prayer}`} className={tableBodyRowClass}>
                    <td className={cn(tableBodyCellClass, "tabular-nums")}>
                      <span className="font-semibold">{m.dayLabel}</span>
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
              title="Day by day"
              totalCount={dailyNewestFirst.length}
              empty="No days in this range."
              minWidth={420}
            >
              <thead>
                <tr className={tableHeadRowClass}>
                  <th className={tableHeadCellClass}>Day</th>
                  <th className={tableHeadCellClass}>On time</th>
                  <th className={tableHeadCellClass}>Kaza</th>
                  <th className={tableHeadCellClass}>Missed</th>
                  <th className={tableHeadCellClass}>Done</th>
                </tr>
              </thead>
              <tbody>
                {dailyNewestFirst.map((d) => (
                  <tr key={d.date} className={tableBodyRowClass}>
                    <td className={cn(tableBodyCellClass, "tabular-nums")}>
                      <span className="font-semibold">{d.dayLabel}</span>
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
                    </td>
                    <td className={tableBodyCellClass}>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
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
                  </tr>
                ))}
              </tbody>
            </AppDataTable>
          </div>

          {kpis.finalizedExpected === 0 ? (
            <EmptyState icon={Sparkles} title="No finished days in this range" />
          ) : null}
        </>
      ) : null}
    </section>
  );
}
