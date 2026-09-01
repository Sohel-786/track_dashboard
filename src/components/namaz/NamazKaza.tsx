"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  Check,
  CheckCheck,
  ChevronDown,
  Clock3,
  History,
  Layers,
  Loader2,
  RotateCcw,
  Sparkles,
  Undo2,
  Users,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  format,
  parseISO,
  startOfMonth,
  startOfYear,
  subDays,
} from "date-fns";
import { api, ApiError } from "@/lib/client-api";
import { trackingStartLabel } from "@/lib/date-ranges";
import type {
  NamazKazaQueueResponse,
  NamazMissedItem,
  NamazPrayerKey,
} from "@/types";
import {
  NAMAZ_PRAYER_META,
  NAMAZ_PRAYERS,
  type NamazPrayer,
} from "@/lib/namaz";
import { cn } from "@/lib/utils";
import { listFilterCardClass } from "@/lib/ui-styles";
import { Button } from "@/components/ui/button";
import { ClearFiltersButton } from "@/components/ui/clear-filters-button";
import { DatePicker } from "@/components/ui/date-picker";
import { FilterLabel } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SELECT_ALL,
} from "@/components/ui/select";

type Extras = { sunnah: boolean; tasbeeh: boolean; zamaat: boolean };
const NO_EXTRAS: Extras = { sunnah: false, tasbeeh: false, zamaat: false };

/**
 * How an outstanding slot gets cleared. Forgetting to log a whole day is not
 * the same as missing the prayers in it, so the queue offers both: `ontime`
 * backfills the entry the user simply never ticked, `kaza` records a real
 * make-up. Only `kaza` counts against the on-time rate in analytics.
 */
type CompleteMode = "ontime" | "kaza";

type SortOrder = "newest" | "oldest";

/**
 * Quick ranges for the Kaza queue. Deliberately past-oriented: today's closed
 * windows are still inside their on-time grace and live on the Today tab, so a
 * "Today" preset here would always be empty.
 */
type KazaRange =
  | "all"
  | "yesterday"
  | "last7"
  | "last30"
  | "month"
  | "year"
  | "custom";

const KAZA_RANGE_PILLS: { key: KazaRange; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "Last 7 days" },
  { key: "last30", label: "Last 30 days" },
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
  { key: "custom", label: "Custom" },
];

/** Resolve a preset into an inclusive [from, to] window of *past* days. */
function resolveKazaRange(
  key: KazaRange,
  today: string
): { from: string; to: string } | null {
  if (key === "all" || key === "custom") return null;

  const todayDate = parseISO(`${today}T00:00:00`);
  const yesterday = format(subDays(todayDate, 1), "yyyy-MM-dd");

  switch (key) {
    case "yesterday":
      return { from: yesterday, to: yesterday };
    case "last7":
      return { from: format(subDays(todayDate, 7), "yyyy-MM-dd"), to: yesterday };
    case "last30":
      return { from: format(subDays(todayDate, 30), "yyyy-MM-dd"), to: yesterday };
    case "month":
      return { from: format(startOfMonth(todayDate), "yyyy-MM-dd"), to: yesterday };
    case "year":
      return { from: format(startOfYear(todayDate), "yyyy-MM-dd"), to: yesterday };
    default:
      return null;
  }
}

type DayGroup = {
  date: string;
  weekday: string;
  daysAgo: number;
  prayers: NamazMissedItem[];
};

function itemKey(item: { date: string; prayer: string }) {
  return `${item.date}:${item.prayer}`;
}

function ageTone(daysAgo: number) {
  if (daysAgo >= 14) return "critical";
  if (daysAgo >= 4) return "warn";
  return "fresh";
}

const AGE_STYLES = {
  fresh: {
    chip: "border-amber-400 bg-amber-100 text-amber-900 dark:border-amber-400/50 dark:bg-amber-400/15 dark:text-amber-100",
    dot: "bg-amber-600 dark:bg-amber-400",
    label: "Recent",
  },
  warn: {
    chip: "border-orange-400 bg-orange-100 text-orange-900 dark:border-orange-400/50 dark:bg-orange-400/15 dark:text-orange-100",
    dot: "bg-orange-600 dark:bg-orange-400",
    label: "Ageing",
  },
  critical: {
    chip: "border-rose-400 bg-rose-100 text-rose-900 dark:border-rose-400/50 dark:bg-rose-400/15 dark:text-rose-100",
    dot: "bg-rose-600 dark:bg-rose-400",
    label: "Overdue",
  },
} as const;

/**
 * Past-days Kaza workspace.
 *
 * Dates are laid out as a grid of day cards; selecting one expands its prayers
 * inline directly beneath that card's row (the panel is a full-width grid item,
 * so auto-placement drops it on the next row) instead of at the page bottom.
 */
export function NamazKaza({
  refreshKey = 0,
  onChanged,
  active = true,
}: {
  refreshKey?: number;
  onChanged?: () => void;
  /** When false, still keep data warm but skip aggressive loading UX. */
  active?: boolean;
}) {
  const [data, setData] = useState<NamazKazaQueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [extrasByItem, setExtrasByItem] = useState<Record<string, Extras>>({});

  const [prayerFilter, setPrayerFilter] = useState("");
  const [range, setRange] = useState<KazaRange>("all");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [sort, setSort] = useState<SortOrder>("newest");
  const [showRecent, setShowRecent] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api<NamazKazaQueueResponse>("/api/namaz/kaza"));
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "Failed to load Kaza queue"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void load();
  }, [load, refreshKey, active]);

  const outstanding = useMemo(() => data?.outstanding ?? [], [data]);

  const allDays: DayGroup[] = useMemo(() => {
    const map = new Map<string, DayGroup>();
    for (const item of outstanding) {
      const group = map.get(item.date) ?? {
        date: item.date,
        weekday: item.weekday,
        daysAgo: item.daysAgo,
        prayers: [],
      };
      group.prayers.push(item);
      map.set(item.date, group);
    }
    return Array.from(map.values()).map((g) => ({
      ...g,
      prayers: g.prayers
        .slice()
        .sort(
          (a, b) =>
            NAMAZ_PRAYERS.indexOf(a.prayer as NamazPrayer) -
            NAMAZ_PRAYERS.indexOf(b.prayer as NamazPrayer)
        ),
    }));
  }, [outstanding]);

  const todayIso = data?.schedule?.today ?? format(new Date(), "yyyy-MM-dd");

  /** The window actually in force — a preset, or the custom date pickers. */
  const activeWindow = useMemo(() => {
    const preset = resolveKazaRange(range, todayIso);
    if (preset) return preset;
    return {
      from: fromDate || null,
      to: toDate || null,
    };
  }, [range, todayIso, fromDate, toDate]);

  const days: DayGroup[] = useMemo(() => {
    const filtered = allDays
      .filter((d) => (activeWindow.from ? d.date >= activeWindow.from : true))
      .filter((d) => (activeWindow.to ? d.date <= activeWindow.to : true))
      .map((d) => ({
        ...d,
        prayers: prayerFilter
          ? d.prayers.filter((p) => p.prayer === prayerFilter)
          : d.prayers,
      }))
      .filter((d) => d.prayers.length > 0);

    return filtered.sort((a, b) =>
      sort === "newest"
        ? b.date.localeCompare(a.date)
        : a.date.localeCompare(b.date)
    );
  }, [allDays, activeWindow, prayerFilter, sort]);

  const visibleCount = days.reduce((n, d) => n + d.prayers.length, 0);
  const totalCount = outstanding.length;
  const hasActiveFilters =
    prayerFilter !== "" ||
    range !== "all" ||
    fromDate !== "" ||
    toDate !== "" ||
    sort !== "newest";

  function applyRange(key: KazaRange) {
    setRange(key);
    const preset = resolveKazaRange(key, todayIso);
    if (preset) {
      // Mirror the preset into the pickers so the dates stay visible.
      setFromDate(preset.from);
      setToDate(preset.to);
    } else if (key === "all") {
      setFromDate("");
      setToDate("");
    }
  }

  // Keep the open day valid as filters change; never auto-open one.
  useEffect(() => {
    if (selectedDate && !days.some((d) => d.date === selectedDate)) {
      setSelectedDate(null);
    }
  }, [days, selectedDate]);

  function extrasFor(key: string) {
    return extrasByItem[key] ?? NO_EXTRAS;
  }

  function setExtras(key: string, patch: Partial<Extras>) {
    setExtrasByItem((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? NO_EXTRAS), ...patch },
    }));
  }

  function resetFilters() {
    setPrayerFilter("");
    setRange("all");
    setFromDate("");
    setToDate("");
    setSort("newest");
  }

  async function completeItem(item: NamazMissedItem, mode: CompleteMode) {
    const key = itemKey(item);
    setBusyKey(`${mode}:${key}`);
    try {
      const result = await api<NamazKazaQueueResponse>("/api/namaz/kaza", {
        method: "PUT",
        body: JSON.stringify({
          date: item.date,
          prayer: item.prayer,
          onTime: mode === "ontime",
          ...extrasFor(key),
        }),
      });
      setData(result);
      const day = format(parseISO(`${item.date}T00:00:00`), "dd MMM yyyy");
      toast.success(
        mode === "ontime"
          ? `${item.label} logged as prayed on time · ${day}`
          : `${item.label} Kaza recorded · ${day}`
      );
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save");
    } finally {
      setBusyKey(null);
    }
  }

  async function completeDay(group: DayGroup, mode: CompleteMode) {
    setBusyKey(`day:${mode}:${group.date}`);
    try {
      const result = await api<NamazKazaQueueResponse>("/api/namaz/kaza", {
        method: "PUT",
        body: JSON.stringify({
          items: group.prayers.map((p) => ({
            date: p.date,
            prayer: p.prayer,
            onTime: mode === "ontime",
            ...extrasFor(itemKey(p)),
          })),
        }),
      });
      setData(result);
      const saved = result.completed ?? group.prayers.length;
      const day = format(parseISO(`${group.date}T00:00:00`), "dd MMM yyyy");
      toast.success(
        mode === "ontime"
          ? `${saved} prayer${saved === 1 ? "" : "s"} logged on time for ${day}`
          : `${saved} make-up${saved === 1 ? "" : "s"} recorded for ${day}`
      );
      if (result.errors?.length) toast.error(result.errors[0]);
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save");
    } finally {
      setBusyKey(null);
    }
  }

  async function undoEntry(item: {
    date: string;
    prayer: NamazPrayerKey;
    label: string;
    mode: CompleteMode;
  }) {
    const key = `undo:${itemKey(item)}`;
    setBusyKey(key);
    try {
      setData(
        await api<NamazKazaQueueResponse>("/api/namaz/kaza", {
          method: "DELETE",
          body: JSON.stringify({ date: item.date, prayer: item.prayer }),
        })
      );
      toast.success(
        item.mode === "ontime"
          ? `${item.label} on-time entry undone`
          : `${item.label} Kaza undone`
      );
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not undo");
    } finally {
      setBusyKey(null);
    }
  }

  const stats = data?.stats;
  const graceToday = data?.graceToday ?? [];

  return (
    <section className="space-y-5" aria-label="Past days Kaza">
      <KazaSummary
        stats={stats}
        graceCount={graceToday.length}
        trackingStart={data?.trackingStart}
        onRefresh={() => void load()}
        loading={loading}
      />

      {loading && !data ? (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading past Kaza…
        </div>
      ) : totalCount === 0 ? (
        <EmptyQueue />
      ) : (
        <div className="space-y-4">
          <div className={listFilterCardClass}>
            <div className="flex flex-wrap gap-2 border-b border-border px-4 py-3">
              {KAZA_RANGE_PILLS.map((pill) => (
                <Button
                  key={pill.key}
                  type="button"
                  size="sm"
                  variant={range === pill.key ? "default" : "secondary"}
                  onClick={() => applyRange(pill.key)}
                  className={cn(
                    "rounded-full px-3",
                    range === pill.key
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
                <FilterLabel>From date</FilterLabel>
                <DatePicker
                  value={fromDate || null}
                  onChange={(iso) => {
                    setRange("custom");
                    setFromDate(iso ?? "");
                  }}
                  placeholder="Earliest"
                  clearable
                  minIso={data?.trackingStart}
                  maxIso={toDate || undefined}
                />
              </div>
              <div className="w-full min-w-[10rem] sm:w-44">
                <FilterLabel>To date</FilterLabel>
                <DatePicker
                  value={toDate || null}
                  onChange={(iso) => {
                    setRange("custom");
                    setToDate(iso ?? "");
                  }}
                  placeholder="Latest"
                  clearable
                  minIso={fromDate || data?.trackingStart}
                />
              </div>
              <div className="w-full min-w-[11rem] flex-1 sm:max-w-[16rem]">
                <FilterLabel>Prayer</FilterLabel>
                <Select
                  value={prayerFilter || SELECT_ALL}
                  onValueChange={(value) =>
                    setPrayerFilter(value === SELECT_ALL ? "" : value)
                  }
                >
                  <SelectTrigger aria-label="Filter Kaza by prayer">
                    <SelectValue placeholder="All prayers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SELECT_ALL}>All prayers</SelectItem>
                    {NAMAZ_PRAYERS.map((key) => {
                      const count =
                        stats?.byPrayer.find((p) => p.prayer === key)?.count ??
                        0;
                      return (
                        <SelectItem key={key} value={key}>
                          {NAMAZ_PRAYER_META[key].label}
                          {count > 0 ? ` · ${count}` : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full min-w-[11rem] sm:w-48">
                <FilterLabel>Order</FilterLabel>
                <Select
                  value={sort}
                  onValueChange={(value) => setSort(value as SortOrder)}
                >
                  <SelectTrigger aria-label="Sort Kaza dates">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest first</SelectItem>
                    <SelectItem value="oldest">Oldest first</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {hasActiveFilters ? (
                <ClearFiltersButton
                  onClick={resetFilters}
                  label="Clear filters"
                />
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground">
                {visibleCount} of {totalCount} pending shown
              </span>
              <span>·</span>
              <span>{days.length} day{days.length === 1 ? "" : "s"}</span>
              {stats?.oldestDate ? (
                <>
                  <span>·</span>
                  <span>
                    oldest{" "}
                    {format(
                      parseISO(`${stats.oldestDate}T00:00:00`),
                      "dd MMM yyyy"
                    )}
                  </span>
                </>
              ) : null}
              {activeWindow.from || activeWindow.to ? (
                <>
                  <span>·</span>
                  <span>
                    {activeWindow.from
                      ? format(
                          parseISO(`${activeWindow.from}T00:00:00`),
                          "dd MMM yyyy"
                        )
                      : "start"}{" "}
                    →{" "}
                    {activeWindow.to
                      ? format(
                          parseISO(`${activeWindow.to}T00:00:00`),
                          "dd MMM yyyy"
                        )
                      : "yesterday"}
                  </span>
                </>
              ) : null}
              <span className="ml-auto inline-flex items-center gap-1">
                {sort === "newest" ? (
                  <ArrowDownWideNarrow className="h-3 w-3" />
                ) : (
                  <ArrowUpWideNarrow className="h-3 w-3" />
                )}
                {sort === "newest" ? "Newest first" : "Oldest first"}
              </span>
            </div>
          </div>

          {days.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-12 text-center">
              <p className="text-sm font-semibold text-foreground">
                No pending Kaza matches these filters
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Widen the date range or clear the prayer filter.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={resetFilters}
                className="mt-4"
              >
                <X className="h-3.5 w-3.5" />
                Clear filters
              </Button>
            </div>
          ) : (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Dates with unrecorded prayers — click one to open it in place
              </p>

              <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2.5">
                {days.map((group) => {
                  const selected = group.date === selectedDate;
                  return (
                    <Fragment key={group.date}>
                      <DayCard
                        group={group}
                        selected={selected}
                        onToggle={() =>
                          setSelectedDate((prev) =>
                            prev === group.date ? null : group.date
                          )
                        }
                      />
                      {/* Full-width grid item — auto-placement drops it onto
                          the row directly below the card that was clicked. */}
                      {selected ? (
                        <DayPanel
                          group={group}
                          busyKey={busyKey}
                          extrasFor={extrasFor}
                          onExtrasChange={setExtras}
                          onComplete={completeItem}
                          onCompleteAll={(mode) => void completeDay(group, mode)}
                          onClose={() => setSelectedDate(null)}
                        />
                      ) : null}
                    </Fragment>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {data?.recent && data.recent.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <button
            type="button"
            onClick={() => setShowRecent((v) => !v)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-muted/40 sm:px-5"
            aria-expanded={showRecent}
          >
            <span className="inline-flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-bold tracking-tight">
                Recently recorded here
              </span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
                {data.recent.length}
              </span>
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                showRecent && "rotate-180"
              )}
            />
          </button>
          {showRecent ? (
            <ul className="divide-y divide-border border-t border-border">
              {data.recent.map((item) => (
                <li
                  key={`${item.date}:${item.prayer}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5"
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      {item.label}
                      <span className="font-normal text-muted-foreground">
                        for{" "}
                        {format(
                          parseISO(`${item.date}T00:00:00`),
                          "EEE, dd MMM yyyy"
                        )}
                      </span>
                      <ModeChip mode={item.mode} />
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {item.completedAt
                        ? `${item.mode === "ontime" ? "Logged" : "Made up"} ${format(
                            new Date(item.completedAt),
                            "dd MMM yyyy · h:mm a"
                          )}`
                        : item.mode === "ontime"
                          ? "Logged"
                          : "Made up"}
                      {item.sunnah ? " · Sunnah" : ""}
                      {item.tasbeeh ? " · Tasbeeh" : ""}
                      {item.zamaat ? " · Zamaat" : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    loading={busyKey === `undo:${itemKey(item)}`}
                    onClick={() => void undoEntry(item)}
                  >
                    {busyKey === `undo:${itemKey(item)}` ? null : (
                      <Undo2 className="h-3.5 w-3.5" />
                    )}
                    Undo
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function KazaSummary({
  stats,
  graceCount,
  trackingStart,
  onRefresh,
  loading,
}: {
  stats?: NamazKazaQueueResponse["stats"];
  graceCount: number;
  trackingStart?: string;
  onRefresh: () => void;
  loading: boolean;
}) {
  const pending = stats?.pending ?? 0;
  const tone = pending === 0 ? "clear" : ageTone(stats?.oldestDaysAgo ?? 0);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border shadow-sm",
        pending === 0
          ? "border-emerald-400/35 bg-gradient-to-br from-emerald-500/[0.12] via-card to-card"
          : "border-amber-400/35 bg-gradient-to-br from-amber-500/[0.12] via-card to-card"
      )}
    >
      <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p
            className={cn(
              "text-xs font-semibold uppercase tracking-wider",
              pending === 0
                ? "text-emerald-800 dark:text-emerald-300"
                : "text-amber-800 dark:text-amber-300"
            )}
          >
            Past days
          </p>
          <h2 className="mt-0.5 text-lg font-bold tracking-tight sm:text-xl">
            {pending === 0 ? "Nothing outstanding" : "Outstanding Kaza"}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Prayers from days that have already closed. Open a date and record
            each one as{" "}
            <span className="font-semibold text-emerald-800 dark:text-emerald-300">
              prayed on time
            </span>{" "}
            if you only forgot to log it, or as{" "}
            <span className="font-semibold text-amber-800 dark:text-amber-300">
              Kaza
            </span>{" "}
            if you actually made it up later. Today&apos;s prayers stay on the{" "}
            <span className="font-semibold text-foreground">Today</span> tab
            until midnight.
            {trackingStart
              ? ` Tracking from ${trackingStartLabel(trackingStart)}.`
              : null}
          </p>
          {graceCount > 0 ? (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-rose-500/50 bg-rose-500/12 px-2.5 py-1.5 text-xs font-semibold text-rose-900 dark:border-rose-400/50 dark:bg-rose-400/12 dark:text-rose-100">
              <AlertTriangle className="h-3.5 w-3.5" />
              {graceCount} prayer{graceCount === 1 ? "" : "s"} from today still
              unmarked — record them on the Today tab before midnight.
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col gap-3">
          <div className="grid grid-cols-3 gap-2">
            <SummaryStat label="Pending" value={pending} tone={tone} />
            <SummaryStat label="Days" value={stats?.days ?? 0} tone="neutral" />
            <SummaryStat
              label="Oldest"
              value={
                stats?.oldestDate
                  ? `${stats.oldestDaysAgo}d`
                  : "—"
              }
              tone={tone}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRefresh}
            loading={loading}
            className="font-bold"
          >
            {loading ? null : <RotateCcw className="h-3.5 w-3.5" />}
            Refresh
          </Button>
        </div>
      </div>

      {stats && pending > 0 ? (
        <div className="flex flex-wrap gap-2 border-t border-border/70 bg-background/40 px-4 py-3 sm:px-5">
          {stats.byPrayer
            .filter((p) => p.count > 0)
            .map((p) => (
              <span
                key={p.prayer}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-semibold"
              >
                <span
                  className={cn(
                    "h-2 w-2 rounded-full bg-gradient-to-b",
                    NAMAZ_PRAYER_META[p.prayer as NamazPrayer]?.accent
                  )}
                />
                {p.label}
                <span className="tabular-nums text-muted-foreground">
                  {p.count}
                </span>
              </span>
            ))}
        </div>
      ) : null}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "fresh" | "warn" | "critical" | "clear" | "neutral";
}) {
  const accent =
    tone === "critical"
      ? "text-rose-800 dark:text-rose-300"
      : tone === "warn"
        ? "text-orange-800 dark:text-orange-300"
        : tone === "fresh"
          ? "text-amber-800 dark:text-amber-300"
          : tone === "clear"
            ? "text-emerald-800 dark:text-emerald-300"
            : "text-foreground";
  return (
    <div className="min-w-[4.5rem] rounded-xl border border-border bg-card px-3 py-2 text-center">
      <p className={cn("text-xl font-bold tabular-nums", accent)}>{value}</p>
      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

function EmptyQueue() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-16 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300">
        <CheckCheck className="h-6 w-6" />
      </div>
      <p className="mt-4 text-base font-bold text-foreground">
        All past days are clear
      </p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        When a day ends with prayers still unrecorded, that date appears here so
        you can log them — on time or as Kaza — in order.
      </p>
    </div>
  );
}

function DayCard({
  group,
  selected,
  onToggle,
}: {
  group: DayGroup;
  selected: boolean;
  onToggle: () => void;
}) {
  const parsed = parseISO(`${group.date}T00:00:00`);
  const age = AGE_STYLES[ageTone(group.daysAgo)];

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={selected}
      aria-label={`${format(parsed, "dd MMMM yyyy")}, ${group.prayers.length} pending`}
      className={cn(
        "group flex flex-col justify-between gap-2 rounded-xl border p-3 text-left shadow-sm transition",
        selected
          ? "border-amber-600 bg-amber-500/12 ring-2 ring-amber-600/30 dark:border-amber-400 dark:bg-amber-400/12 dark:ring-amber-400/30"
          : "border-border bg-card hover:border-amber-500 hover:bg-amber-500/8"
      )}
    >
      <div>
        <div className="flex items-center justify-between gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {format(parsed, "EEE")}
          </span>
          <span className={cn("h-2 w-2 rounded-full", age.dot)} />
        </div>
        <p className="mt-1 text-lg font-bold tabular-nums leading-none tracking-tight">
          {format(parsed, "dd")}
          <span className="ml-1 text-xs font-semibold text-muted-foreground">
            {format(parsed, "MMM")}
          </span>
        </p>
        <p className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">
          {format(parsed, "yyyy")} · {group.daysAgo}d ago
        </p>
      </div>

      <div className="flex items-center justify-between gap-1">
        <span
          className={cn(
            "rounded-md border px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
            age.chip
          )}
        >
          {group.prayers.length} pending
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
            selected && "rotate-180"
          )}
        />
      </div>
    </button>
  );
}

function DayPanel({
  group,
  busyKey,
  extrasFor,
  onExtrasChange,
  onComplete,
  onCompleteAll,
  onClose,
}: {
  group: DayGroup;
  busyKey: string | null;
  extrasFor: (key: string) => Extras;
  onExtrasChange: (key: string, patch: Partial<Extras>) => void;
  onComplete: (item: NamazMissedItem, mode: CompleteMode) => void;
  onCompleteAll: (mode: CompleteMode) => void;
  onClose: () => void;
}) {
  const parsed = parseISO(`${group.date}T00:00:00`);
  const bulkOnTimeBusy = busyKey === `day:ontime:${group.date}`;
  const bulkKazaBusy = busyKey === `day:kaza:${group.date}`;
  const bulkBusy = bulkOnTimeBusy || bulkKazaBusy;

  return (
    <div
      className="col-span-full overflow-hidden rounded-xl border-2 border-amber-600/60 bg-card shadow-md dark:border-amber-400/50"
      role="region"
      aria-label={`Unrecorded prayers for ${group.date}`}
    >
      <div className="flex flex-col gap-3 border-b border-border bg-amber-500/10 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-5 dark:bg-amber-400/10">
        <div className="min-w-0">
          <h3 className="text-base font-bold tracking-tight">
            {format(parsed, "EEEE, d MMMM yyyy")}
          </h3>
          <p className="text-xs text-muted-foreground">
            {format(parsed, "dd/MM/yyyy")} · {group.daysAgo} day
            {group.daysAgo === 1 ? "" : "s"} ago · {group.prayers.length} prayer
            {group.prayers.length === 1 ? "" : "s"} still unrecorded
          </p>
          <p className="mt-1.5 max-w-xl text-xs text-muted-foreground">
            Prayed one of these in its own window and only forgot to tick it?
            Record it as{" "}
            <span className="font-semibold text-emerald-800 dark:text-emerald-300">
              prayed on time
            </span>{" "}
            — keep{" "}
            <span className="font-semibold text-amber-800 dark:text-amber-300">
              Kaza
            </span>{" "}
            for the ones you genuinely made up later.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {group.prayers.length > 1 ? (
            <>
              <Button
                type="button"
                variant="emerald"
                size="sm"
                loading={bulkOnTimeBusy}
                disabled={bulkBusy}
                onClick={() => onCompleteAll("ontime")}
              >
                {bulkOnTimeBusy ? null : <CheckCheck className="h-3.5 w-3.5" />}
                All {group.prayers.length} on time
              </Button>
              <Button
                type="button"
                variant="amber"
                size="sm"
                loading={bulkKazaBusy}
                disabled={bulkBusy}
                onClick={() => onCompleteAll("kaza")}
              >
                {bulkKazaBusy ? null : <Layers className="h-3.5 w-3.5" />}
                All {group.prayers.length} Kaza
              </Button>
            </>
          ) : null}
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
            Close
          </Button>
        </div>
      </div>

      <ul className="divide-y divide-border">
        {group.prayers.map((item) => {
          const key = itemKey(item);
          const onTimeBusy = busyKey === `ontime:${key}`;
          const kazaBusy = busyKey === `kaza:${key}`;
          const busy = onTimeBusy || kazaBusy || bulkBusy;
          const extras = extrasFor(key);
          const meta = NAMAZ_PRAYER_META[item.prayer as NamazPrayer] ?? null;
          return (
            <li
              key={key}
              className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between lg:px-5"
            >
              <div className="flex min-w-0 items-start gap-3">
                <div
                  className={cn(
                    "mt-0.5 h-10 w-1.5 shrink-0 rounded-full bg-gradient-to-b",
                    meta?.accent ?? "from-amber-500 to-orange-600"
                  )}
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-bold tracking-tight">
                      {item.label}
                    </p>
                    <span className="text-sm text-muted-foreground" dir="rtl">
                      {item.arabic}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Pick the extras you performed, then say how it was offered.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <ExtraToggle
                      label="Sunnah"
                      active={extras.sunnah}
                      disabled={busy}
                      onClick={() =>
                        onExtrasChange(key, { sunnah: !extras.sunnah })
                      }
                    />
                    <ExtraToggle
                      label="Tasbeeh"
                      active={extras.tasbeeh}
                      disabled={busy}
                      icon={Sparkles}
                      onClick={() =>
                        onExtrasChange(key, { tasbeeh: !extras.tasbeeh })
                      }
                    />
                    <ExtraToggle
                      label="With Zamaat"
                      active={extras.zamaat}
                      disabled={busy}
                      icon={Users}
                      onClick={() =>
                        onExtrasChange(key, { zamaat: !extras.zamaat })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:min-w-[20.5rem]">
                <Button
                  type="button"
                  variant="emerald"
                  loading={onTimeBusy}
                  disabled={busy}
                  onClick={() => onComplete(item, "ontime")}
                  className="flex-1"
                >
                  {onTimeBusy ? null : <Check className="h-4 w-4" />}
                  Prayed on time
                </Button>
                <Button
                  type="button"
                  variant="amber"
                  loading={kazaBusy}
                  disabled={busy}
                  onClick={() => onComplete(item, "kaza")}
                  className="flex-1"
                >
                  {kazaBusy ? null : <Clock3 className="h-4 w-4" />}
                  Mark Kaza
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Distinguishes a backfilled on-time entry from a real make-up in the log. */
function ModeChip({ mode }: { mode: CompleteMode }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        mode === "ontime"
          ? "border-emerald-500/50 bg-emerald-500/12 text-emerald-900 dark:border-emerald-400/50 dark:bg-emerald-400/12 dark:text-emerald-100"
          : "border-amber-500/50 bg-amber-500/12 text-amber-900 dark:border-amber-400/50 dark:bg-amber-400/12 dark:text-amber-100"
      )}
    >
      {mode === "ontime" ? "On time" : "Kaza"}
    </span>
  );
}

function ExtraToggle({
  label,
  active,
  disabled,
  onClick,
  icon: Icon,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon?: typeof Sparkles;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition",
        active
          ? "border-teal-600/50 bg-teal-500/12 text-teal-900 dark:border-teal-400/50 dark:bg-teal-400/12 dark:text-teal-100"
          : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
        disabled && "cursor-not-allowed opacity-60"
      )}
    >
      {Icon ? <Icon className="h-3 w-3" /> : null}
      <span>{label}</span>
      <span
        className={cn(
          "flex h-4 w-4 items-center justify-center rounded border",
          active
            ? "border-teal-700 bg-teal-700 text-white dark:border-teal-400 dark:bg-teal-400 dark:text-teal-950"
            : "border-border bg-card"
        )}
      >
        {active ? <Check className="h-2.5 w-2.5" /> : null}
      </span>
    </button>
  );
}

/** Badge helper for the page tab — past days only. */
export function usePastKazaCount(refreshKey = 0) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await api<NamazKazaQueueResponse>("/api/namaz/kaza");
        if (!cancelled) setCount(result.count ?? 0);
      } catch {
        if (!cancelled) setCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return count;
}
