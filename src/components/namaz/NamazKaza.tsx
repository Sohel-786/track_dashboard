"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  Check,
  CheckCheck,
  ChevronDown,
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
import { format, parseISO } from "date-fns";
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

type SortOrder = "newest" | "oldest";

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
    chip: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100",
    dot: "bg-amber-500",
    label: "Recent",
  },
  warn: {
    chip: "border-orange-300 bg-orange-50 text-orange-900 dark:border-orange-900/60 dark:bg-orange-950/40 dark:text-orange-100",
    dot: "bg-orange-500",
    label: "Ageing",
  },
  critical: {
    chip: "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-100",
    dot: "bg-rose-500",
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

  const days: DayGroup[] = useMemo(() => {
    const filtered = allDays
      .filter((d) => (fromDate ? d.date >= fromDate : true))
      .filter((d) => (toDate ? d.date <= toDate : true))
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
  }, [allDays, fromDate, toDate, prayerFilter, sort]);

  const visibleCount = days.reduce((n, d) => n + d.prayers.length, 0);
  const totalCount = outstanding.length;
  const hasActiveFilters =
    prayerFilter !== "" || fromDate !== "" || toDate !== "" || sort !== "newest";

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
    setFromDate("");
    setToDate("");
    setSort("newest");
  }

  async function completeKaza(item: NamazMissedItem) {
    const key = itemKey(item);
    setBusyKey(key);
    try {
      const result = await api<NamazKazaQueueResponse>("/api/namaz/kaza", {
        method: "PUT",
        body: JSON.stringify({
          date: item.date,
          prayer: item.prayer,
          ...extrasFor(key),
        }),
      });
      setData(result);
      toast.success(
        `${item.label} Kaza recorded · ${format(parseISO(`${item.date}T00:00:00`), "dd MMM yyyy")}`
      );
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save Kaza");
    } finally {
      setBusyKey(null);
    }
  }

  async function completeDay(group: DayGroup) {
    const key = `day:${group.date}`;
    setBusyKey(key);
    try {
      const result = await api<NamazKazaQueueResponse>("/api/namaz/kaza", {
        method: "PUT",
        body: JSON.stringify({
          items: group.prayers.map((p) => ({
            date: p.date,
            prayer: p.prayer,
            ...extrasFor(itemKey(p)),
          })),
        }),
      });
      setData(result);
      toast.success(
        `${result.completed ?? group.prayers.length} make-ups recorded for ${format(
          parseISO(`${group.date}T00:00:00`),
          "dd MMM yyyy"
        )}`
      );
      if (result.errors?.length) toast.error(result.errors[0]);
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save Kaza");
    } finally {
      setBusyKey(null);
    }
  }

  async function undoKaza(item: { date: string; prayer: NamazPrayerKey; label: string }) {
    const key = `undo:${itemKey(item)}`;
    setBusyKey(key);
    try {
      setData(
        await api<NamazKazaQueueResponse>("/api/namaz/kaza", {
          method: "DELETE",
          body: JSON.stringify({ date: item.date, prayer: item.prayer }),
        })
      );
      toast.success(`${item.label} Kaza undone`);
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
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="w-full min-w-[10rem] sm:w-44">
                <FilterLabel>From date</FilterLabel>
                <DatePicker
                  value={fromDate || null}
                  onChange={(iso) => setFromDate(iso ?? "")}
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
                  onChange={(iso) => setToDate(iso ?? "")}
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
                Dates with missed prayers — click one to open it in place
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
                          onComplete={completeKaza}
                          onCompleteAll={() => void completeDay(group)}
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
                Recently completed Kaza
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
                    <p className="text-sm font-semibold">
                      {item.label}
                      <span className="ml-2 font-normal text-muted-foreground">
                        for{" "}
                        {format(
                          parseISO(`${item.date}T00:00:00`),
                          "EEE, dd MMM yyyy"
                        )}
                      </span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {item.kazaAt
                        ? `Made up ${format(new Date(item.kazaAt), "dd MMM yyyy · h:mm a")}`
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
                    onClick={() => void undoKaza(item)}
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
                ? "text-emerald-700 dark:text-emerald-300"
                : "text-amber-700 dark:text-amber-300"
            )}
          >
            Past days
          </p>
          <h2 className="mt-0.5 text-lg font-bold tracking-tight sm:text-xl">
            {pending === 0 ? "Nothing outstanding" : "Outstanding Kaza"}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Prayers from days that have already closed. Today&apos;s prayers stay
            on the <span className="font-semibold text-foreground">Today</span>{" "}
            tab, where they can still be marked as prayed on time until midnight.
            {trackingStart
              ? ` Tracking from ${trackingStartLabel(trackingStart)}.`
              : null}
          </p>
          {graceCount > 0 ? (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-rose-300/60 bg-rose-500/10 px-2.5 py-1.5 text-xs font-semibold text-rose-900 dark:border-rose-900 dark:text-rose-100">
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
      ? "text-rose-700 dark:text-rose-300"
      : tone === "warn"
        ? "text-orange-700 dark:text-orange-300"
        : tone === "fresh"
          ? "text-amber-700 dark:text-amber-300"
          : tone === "clear"
            ? "text-emerald-700 dark:text-emerald-300"
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
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
        <CheckCheck className="h-6 w-6" />
      </div>
      <p className="mt-4 text-base font-bold text-foreground">
        All past days are clear
      </p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        When a day ends with prayers still unrecorded, that date appears here so
        you can make them up in order.
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
        "group flex flex-col justify-between gap-2 rounded-xl border p-3 text-left transition",
        selected
          ? "border-amber-500 bg-amber-500/10 ring-2 ring-amber-500/30"
          : "border-border bg-card hover:border-amber-400/70 hover:bg-amber-500/5"
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
  onComplete: (item: NamazMissedItem) => void;
  onCompleteAll: () => void;
  onClose: () => void;
}) {
  const parsed = parseISO(`${group.date}T00:00:00`);
  const bulkBusy = busyKey === `day:${group.date}`;

  return (
    <div
      className="col-span-full overflow-hidden rounded-xl border border-amber-400/50 bg-card shadow-md"
      role="region"
      aria-label={`Missed prayers for ${group.date}`}
    >
      <div className="flex flex-col gap-3 border-b border-border bg-amber-500/[0.07] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          <h3 className="text-base font-bold tracking-tight">
            {format(parsed, "EEEE, d MMMM yyyy")}
          </h3>
          <p className="text-xs text-muted-foreground">
            {format(parsed, "dd/MM/yyyy")} · {group.daysAgo} day
            {group.daysAgo === 1 ? "" : "s"} ago · {group.prayers.length} prayer
            {group.prayers.length === 1 ? "" : "s"} still need Kaza
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {group.prayers.length > 1 ? (
            <Button
              type="button"
              variant="amber"
              size="sm"
              loading={bulkBusy}
              onClick={onCompleteAll}
            >
              {bulkBusy ? null : <Layers className="h-3.5 w-3.5" />}
              Mark all {group.prayers.length}
            </Button>
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
          const busy = busyKey === key || bulkBusy;
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
                    Pick the extras you performed with the make-up, then record it.
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

              <Button
                type="button"
                variant="amber"
                loading={busyKey === key}
                disabled={busy}
                onClick={() => onComplete(item)}
                className="shrink-0 lg:min-w-[9.5rem]"
              >
                {busyKey === key ? null : <Check className="h-4 w-4" />}
                Mark Kaza
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
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
          ? "border-teal-400/50 bg-teal-500/10 text-teal-900 dark:text-teal-100"
          : "border-border bg-background text-muted-foreground hover:bg-muted/50",
        disabled && "cursor-not-allowed opacity-60"
      )}
    >
      {Icon ? <Icon className="h-3 w-3" /> : null}
      <span>{label}</span>
      <span
        className={cn(
          "flex h-4 w-4 items-center justify-center rounded border",
          active ? "border-teal-500 bg-teal-500 text-white" : "border-border"
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
