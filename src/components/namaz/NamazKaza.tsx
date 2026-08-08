"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  Loader2,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import toast from "react-hot-toast";
import { format, parseISO } from "date-fns";
import { api, ApiError } from "@/lib/client-api";
import { trackingStartLabel } from "@/lib/date-ranges";
import type { NamazKazaQueueResponse, NamazMissedItem } from "@/types";
import {
  NAMAZ_PRAYER_META,
  NAMAZ_PRAYERS,
  type NamazPrayer,
} from "@/lib/namaz";
import { cn } from "@/lib/utils";
import { listFilterCardClass } from "@/lib/ui-styles";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ClearFiltersButton } from "@/components/ui/clear-filters-button";
import { FilterLabel } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SELECT_ALL,
} from "@/components/ui/select";

type DayGroup = {
  date: string;
  dayLabel: string;
  prayers: NamazMissedItem[];
};

/**
 * Past-days Kaza workspace: date squares (dd/mm/yyyy) → one expanded day → mark make-ups.
 * Same-day Kaza stays on the Today / Namaz tab cards.
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
  const [prayerFilter, setPrayerFilter] = useState("");
  const [sunnahByPrayer, setSunnahByPrayer] = useState<Record<string, boolean>>(
    {}
  );
  const [tasbeehByPrayer, setTasbeehByPrayer] = useState<
    Record<string, boolean>
  >({});
  const [zamaatByPrayer, setZamaatByPrayer] = useState<Record<string, boolean>>(
    {}
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api<NamazKazaQueueResponse>("/api/namaz/kaza");
      setData(result);
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

  const todayIso = data?.schedule?.today;

  const pastDays: DayGroup[] = useMemo(() => {
    const map = new Map<string, NamazMissedItem[]>();
    for (const item of data?.outstanding ?? []) {
      if (todayIso && item.date >= todayIso) continue;
      const list = map.get(item.date) ?? [];
      list.push(item);
      map.set(item.date, list);
    }
    return Array.from(map.entries())
      .map(([date, prayers]) => ({
        date,
        dayLabel: prayers[0]?.dayLabel ?? "",
        prayers,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [data, todayIso]);

  const filteredPastDays: DayGroup[] = useMemo(() => {
    if (!prayerFilter) return pastDays;
    return pastDays
      .map((day) => ({
        ...day,
        prayers: day.prayers.filter((p) => p.prayer === prayerFilter),
      }))
      .filter((day) => day.prayers.length > 0);
  }, [pastDays, prayerFilter]);

  const pastCount = pastDays.reduce((n, d) => n + d.prayers.length, 0);
  const hasActiveFilters = prayerFilter !== "";

  // Keep selection valid when the queue / filter changes (do not auto-open).
  useEffect(() => {
    if (
      selectedDate &&
      !filteredPastDays.some((d) => d.date === selectedDate)
    ) {
      setSelectedDate(null);
    }
  }, [filteredPastDays, selectedDate]);

  const selectedGroup =
    filteredPastDays.find((d) => d.date === selectedDate) ?? null;

  async function completeKaza(item: NamazMissedItem) {
    const key = `${item.date}:${item.prayer}`;
    setBusyKey(key);
    try {
      const result = await api<NamazKazaQueueResponse>("/api/namaz/kaza", {
        method: "PUT",
        body: JSON.stringify({
          date: item.date,
          prayer: item.prayer,
          sunnah: Boolean(sunnahByPrayer[key]),
          tasbeeh: Boolean(tasbeehByPrayer[key]),
          zamaat: Boolean(zamaatByPrayer[key]),
        }),
      });
      setData(result);
      toast.success(`${item.label} Kaza recorded · ${item.date}`);
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save Kaza");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <section className="space-y-5" aria-label="Past days Kaza">
      <div className="rounded-2xl border border-amber-400/35 bg-gradient-to-br from-amber-500/[0.12] via-card to-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
              Past days
            </p>
            <h2 className="mt-0.5 text-lg font-bold tracking-tight sm:text-xl">
              Outstanding Kaza
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Choose a date square to expand that day&apos;s missed prayers,
              then mark each make-up. Only one day stays expanded at a time.
              Same-day make-ups stay on the{" "}
              <span className="font-semibold text-foreground">Today</span> tab.
              {data?.trackingStart
                ? ` Tracking from ${trackingStartLabel(data.trackingStart)}.`
                : null}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-amber-500/20 px-3 py-1.5 text-xs font-bold text-amber-950 dark:text-amber-100">
              {pastCount} pending
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void load()}
              className="font-bold"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading past Kaza…
        </div>
      ) : pastDays.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-16 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
            <Check className="h-6 w-6" />
          </div>
          <p className="mt-4 text-base font-bold text-foreground">
            All past days are clear
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            When a previous day ends with unpaid prayers, that date appears here
            as a pill so you can make them up in order.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className={listFilterCardClass}>
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="w-full min-w-[12rem] flex-1 sm:max-w-xs">
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
                    {NAMAZ_PRAYERS.map((key) => (
                      <SelectItem key={key} value={key}>
                        {NAMAZ_PRAYER_META[key].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {hasActiveFilters ? (
                <ClearFiltersButton
                  onClick={() => setPrayerFilter("")}
                  label="Clear filters"
                />
              ) : null}
            </div>
          </div>

          {filteredPastDays.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-12 text-center">
              <p className="text-sm font-semibold text-foreground">
                No outstanding{" "}
                {prayerFilter
                  ? NAMAZ_PRAYER_META[prayerFilter as NamazPrayer]?.label
                  : ""}{" "}
                Kaza in past days
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Clear the prayer filter to see all pending make-ups.
              </p>
            </div>
          ) : (
            <>
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Dates with missed prayers
                </p>
                <p className="mb-3 text-xs text-muted-foreground">
                  Click a date to expand that day. Opening another date closes
                  the previous one.
                </p>
                <div
                  className="flex flex-wrap gap-2.5"
                  role="listbox"
                  aria-label="Kaza dates"
                  aria-orientation="horizontal"
                >
                  {filteredPastDays.map((day) => {
                    const selected = day.date === selectedDate;
                    const label = format(
                      parseISO(`${day.date}T00:00:00`),
                      "dd/MM/yyyy"
                    );
                    return (
                      <Button
                        key={day.date}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        aria-expanded={selected}
                        aria-label={`${label}, ${day.prayers.length} missed`}
                        variant={selected ? "default" : "outline"}
                        onClick={() =>
                          setSelectedDate((prev) =>
                            prev === day.date ? null : day.date
                          )
                        }
                        title={`${day.dayLabel} · ${day.prayers.length} missed`}
                        className={cn(
                          "h-[5.25rem] w-[5.25rem] shrink-0 rounded-lg p-1.5 text-center text-[11px] font-bold tabular-nums leading-tight tracking-tight",
                          selected
                            ? "border-amber-600 bg-amber-600 text-white hover:bg-amber-700"
                            : "bg-card text-foreground hover:border-amber-500/70 hover:bg-amber-500/5"
                        )}
                      >
                        {label}
                      </Button>
                    );
                  })}
                </div>
              </div>

              {selectedGroup ? (
                <div
                  className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
                  role="region"
                  aria-label={`Missed prayers for ${selectedGroup.date}`}
                >
                  <div className="flex flex-col gap-1 border-b border-border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <div>
                      <h3 className="text-base font-bold tracking-tight">
                        {format(
                          parseISO(`${selectedGroup.date}T00:00:00`),
                          "EEEE, d MMMM yyyy"
                        )}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {format(
                          parseISO(`${selectedGroup.date}T00:00:00`),
                          "dd/MM/yyyy"
                        )}{" "}
                        · {selectedGroup.prayers.length} prayer
                        {selectedGroup.prayers.length === 1 ? "" : "s"} still
                        need Kaza
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                      <ChevronDown className="h-3.5 w-3.5" />
                      Expanded
                    </span>
                  </div>

                  <ul className="divide-y divide-border">
                    {selectedGroup.prayers.map((item) => {
                      const key = `${item.date}:${item.prayer}`;
                      const busy = busyKey === key;
                      const meta =
                        NAMAZ_PRAYER_META[item.prayer as NamazPrayer] ?? null;
                      return (
                        <li
                          key={key}
                          className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
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
                                {meta ? (
                                  <span
                                    className="text-sm text-muted-foreground"
                                    dir="rtl"
                                  >
                                    {meta.arabic}
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                Missed on{" "}
                                {format(
                                  parseISO(`${selectedGroup.date}T00:00:00`),
                                  "dd/MM/yyyy"
                                )}{" "}
                                · mark when you have prayed the make-up
                              </p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <ExtraToggle
                                  label="Sunnah"
                                  active={Boolean(sunnahByPrayer[key])}
                                  disabled={busy}
                                  onClick={() =>
                                    setSunnahByPrayer((prev) => ({
                                      ...prev,
                                      [key]: !prev[key],
                                    }))
                                  }
                                />
                                <ExtraToggle
                                  label="Tasbeeh"
                                  active={Boolean(tasbeehByPrayer[key])}
                                  disabled={busy}
                                  icon
                                  onClick={() =>
                                    setTasbeehByPrayer((prev) => ({
                                      ...prev,
                                      [key]: !prev[key],
                                    }))
                                  }
                                />
                                <ExtraToggle
                                  label="With Zamaat"
                                  active={Boolean(zamaatByPrayer[key])}
                                  disabled={busy}
                                  onClick={() =>
                                    setZamaatByPrayer((prev) => ({
                                      ...prev,
                                      [key]: !prev[key],
                                    }))
                                  }
                                />
                              </div>
                            </div>
                          </div>

                          <Button
                            type="button"
                            variant="amber"
                            loading={busy}
                            onClick={() => void completeKaza(item)}
                            className="shrink-0 sm:min-w-[9.5rem]"
                          >
                            {!busy ? <Check className="h-4 w-4" /> : null}
                            Mark Kaza
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-muted/15 px-4 py-10 text-center text-sm text-muted-foreground">
                  Click a date square above to expand its missed prayers.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function ExtraToggle({
  label,
  active,
  disabled,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon?: boolean;
}) {
  return (
    <label
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition",
        active
          ? "border-teal-400/50 bg-teal-500/10 text-teal-900 dark:text-teal-100"
          : "border-border bg-background text-muted-foreground hover:bg-muted/50",
        disabled && "cursor-not-allowed opacity-60"
      )}
    >
      {icon ? <Sparkles className="h-3 w-3" /> : null}
      <span>{label}</span>
      <Checkbox
        checked={active}
        disabled={disabled}
        onCheckedChange={() => onClick()}
        aria-label={label}
      />
    </label>
  );
}

/** Lightweight badge helper for the page tab (past days only). */
export function usePastKazaCount(refreshKey = 0) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await api<NamazKazaQueueResponse>("/api/namaz/kaza");
        const today = result.schedule?.today;
        const n = (result.outstanding ?? []).filter(
          (i) => !today || i.date < today
        ).length;
        if (!cancelled) setCount(n);
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
