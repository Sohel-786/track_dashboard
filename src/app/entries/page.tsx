"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  Activity,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Flame,
  Layers,
  Pencil,
  Plus,
  Search,
  Target,
  Trash2,
  Undo2,
  Zap,
} from "lucide-react";
import toast from "react-hot-toast";
import { addDays, format, isValid, parseISO } from "date-fns";
import { api, ApiError } from "@/lib/client-api";
import { todayIso } from "@/lib/date-ranges";
import { PageHeader, PageShell } from "@/components/layout/PageShell";
import { Dialog } from "@/components/ui/Dialog";
import { AppDataTable } from "@/components/ui/AppDataTable";
import { Button } from "@/components/ui/button";
import { ClearFiltersButton } from "@/components/ui/clear-filters-button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { FilterLabel } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SELECT_ALL,
} from "@/components/ui/select";
import {
  EmptyState,
  StatTile,
} from "@/components/dashboard/insight-widgets";
import {
  listFilterCardClass,
  tableBodyCellClass,
  tableBodyRowClass,
  tableHeadCellClass,
  tableHeadRowClass,
} from "@/lib/ui-styles";
import { cn } from "@/lib/utils";
import type {
  AnalyticsResponse,
  Category,
  DaySummary,
  EntriesResponse,
  Entry,
} from "@/types";

const STRIP_DAYS = 14;

/** Sensible one-tap amounts derived from a category's daily target. */
function quickAmounts(target: number): number[] {
  if (target <= 0) return [1];
  if (target <= 3) {
    return Array.from({ length: target }, (_, i) => i + 1);
  }
  const quarter = Math.max(1, Math.round(target / 4));
  const half = Math.max(quarter + 1, Math.round(target / 2));
  return Array.from(new Set([quarter, half, target])).filter((n) => n > 0);
}

function shiftIso(iso: string, delta: number) {
  const parsed = parseISO(`${iso}T00:00:00`);
  if (!isValid(parsed)) return iso;
  return format(addDays(parsed, delta), "yyyy-MM-dd");
}

type SortKey = "newest" | "oldest" | "largest" | "category";

export default function EntriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [daySummaries, setDaySummaries] = useState<DaySummary[]>([]);
  const [strip, setStrip] = useState<AnalyticsResponse["dailyTargetHits"]>([]);
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [quickBusy, setQuickBusy] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");

  const [filterCategoryId, setFilterCategoryId] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");

  const isToday = selectedDate === todayIso();
  const isFuture = selectedDate > todayIso();

  const loadDay = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ date: selectedDate, limit: "500" });
      const [cats, payload] = await Promise.all([
        api<Category[]>("/api/categories"),
        api<EntriesResponse>(`/api/entries?${params.toString()}`),
      ]);
      setCategories(cats);
      setEntries(payload.entries);
      setDaySummaries(payload.daySummaries);
      setCategoryId((prev) =>
        prev && cats.some((c) => c.id === prev) ? prev : (cats[0]?.id ?? "")
      );
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  const loadStrip = useCallback(async () => {
    // Keep today as the anchor while browsing recent days; only follow the
    // selection once it falls outside that window, so it stays visible.
    const anchor = todayIso();
    const windowStart = shiftIso(anchor, -(STRIP_DAYS - 1));
    const end =
      selectedDate > anchor || selectedDate < windowStart
        ? selectedDate
        : anchor;
    const start = shiftIso(end, -(STRIP_DAYS - 1));
    try {
      const params = new URLSearchParams({
        range: "custom",
        from: start,
        to: end,
      });
      const result = await api<AnalyticsResponse>(
        `/api/analytics?${params.toString()}`
      );
      setStrip(result.dailyTargetHits);
    } catch {
      setStrip([]);
    }
  }, [selectedDate]);

  useEffect(() => {
    void loadDay();
  }, [loadDay]);

  useEffect(() => {
    void loadStrip();
  }, [loadStrip]);

  async function refresh() {
    await Promise.all([loadDay(), loadStrip()]);
  }

  const activeCategories = useMemo(
    () => categories.filter((c) => c.isActive),
    [categories]
  );

  const summaryById = useMemo(
    () => new Map(daySummaries.map((s) => [s.categoryId, s])),
    [daySummaries]
  );

  const dayTotal = daySummaries.reduce((n, s) => n + s.dayTotal, 0);
  const targetsHit = daySummaries.filter((s) => s.hitTarget).length;
  const topCategory = useMemo(
    () =>
      daySummaries.reduce<DaySummary | null>(
        (best, s) => (!best || s.dayTotal > best.dayTotal ? s : best),
        null
      ),
    [daySummaries]
  );

  const visibleEntries = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = entries.filter((e) => {
      if (filterCategoryId && e.categoryId !== filterCategoryId) return false;
      if (!needle) return true;
      return (
        e.categoryName.toLowerCase().includes(needle) ||
        e.note.toLowerCase().includes(needle) ||
        String(e.value).includes(needle)
      );
    });

    return rows.sort((a, b) => {
      if (sort === "largest") return b.value - a.value;
      if (sort === "category") {
        return (
          a.categoryName.localeCompare(b.categoryName) ||
          (b.createdAt ?? "").localeCompare(a.createdAt ?? "")
        );
      }
      const cmp = (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
      return sort === "oldest" ? cmp : -cmp;
    });
  }, [entries, filterCategoryId, search, sort]);

  const hasActiveFilters =
    Boolean(filterCategoryId) || search.trim() !== "" || sort !== "newest";

  /** Create one entry. Used by both quick-log and the dialog. */
  async function createEntry(input: {
    categoryId: string;
    value: number;
    note?: string;
    date?: string;
    silent?: boolean;
  }) {
    await api("/api/entries", {
      method: "POST",
      body: JSON.stringify({
        categoryId: input.categoryId,
        value: input.value,
        date: input.date ?? selectedDate,
        note: input.note?.trim() || undefined,
      }),
    });
    if (!input.silent) {
      const name =
        categories.find((c) => c.id === input.categoryId)?.name ?? "Entry";
      toast.success(`+${input.value} logged to ${name}`);
    }
    await refresh();
  }

  async function quickLog(category: Category, amount: number) {
    const key = `${category.id}:${amount}`;
    setQuickBusy(key);
    try {
      await createEntry({ categoryId: category.id, value: amount });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not log entry");
    } finally {
      setQuickBusy(null);
    }
  }

  function openCreate(presetCategoryId?: string) {
    setEditing(null);
    setValue("");
    setNote("");
    if (presetCategoryId) setCategoryId(presetCategoryId);
    else if (!categoryId && activeCategories[0]) {
      setCategoryId(activeCategories[0].id);
    }
    setDialogOpen(true);
  }

  function openEdit(entry: Entry) {
    setEditing(entry);
    setCategoryId(entry.categoryId);
    setValue(String(entry.value));
    setNote(entry.note);
    setDialogOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const num = Number(value);
    if (!categoryId || !Number.isFinite(num) || num < 0) {
      toast.error("Select a category and enter a valid number");
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        await api(`/api/entries/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            categoryId,
            value: num,
            note: note.trim(),
          }),
        });
        toast.success("Entry updated");
        await refresh();
      } else {
        await createEntry({ categoryId, value: num, note });
      }
      setDialogOpen(false);
      setEditing(null);
      setValue("");
      setNote("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  /** Delete with an inline undo — no confirm dialog for a one-value entry. */
  async function remove(entry: Entry) {
    try {
      await api(`/api/entries/${entry.id}`, { method: "DELETE" });
      await refresh();
      toast(
        (t) => (
          <span className="flex items-center gap-3">
            <span className="text-sm">
              Deleted{" "}
              <strong>
                {entry.value} · {entry.categoryName}
              </strong>
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={async () => {
                toast.dismiss(t.id);
                try {
                  await createEntry({
                    categoryId: entry.categoryId,
                    value: entry.value,
                    note: entry.note,
                    date: entry.date,
                    silent: true,
                  });
                  toast.success("Entry restored");
                } catch {
                  toast.error("Could not restore entry");
                }
              }}
            >
              <Undo2 className="h-3.5 w-3.5" />
              Undo
            </Button>
          </span>
        ),
        { duration: 6000 }
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Daily Entries"
        description="Log values toward each category’s daily target. Targets reset every day."
        action={
          <Button
            type="button"
            onClick={() => openCreate()}
            disabled={activeCategories.length === 0}
          >
            <Plus />
            Add Entry
          </Button>
        }
      />

      <DayNavigator
        selectedDate={selectedDate}
        onSelect={setSelectedDate}
        strip={strip}
      />

      {activeCategories.length === 0 && !loading ? (
        <EmptyState
          icon={Layers}
          title="No categories yet"
          description="Create a category with a daily target before logging entries."
          action={
            <Button asChild>
              <Link href="/categories">
                <Plus className="h-4 w-4" />
                Go to Category Master
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label={isToday ? "Logged today" : "Logged this day"}
              value={dayTotal}
              sub={`${entries.length} entr${entries.length === 1 ? "y" : "ies"}`}
              icon={Activity}
              accent="teal"
            />
            <StatTile
              label="Targets hit"
              value={`${targetsHit}/${daySummaries.length}`}
              sub={
                targetsHit === daySummaries.length && daySummaries.length > 0
                  ? "Every category on target"
                  : `${daySummaries.length - targetsHit} still short`
              }
              icon={Target}
              accent={
                daySummaries.length > 0 && targetsHit === daySummaries.length
                  ? "emerald"
                  : "amber"
              }
              progress={
                daySummaries.length > 0
                  ? (targetsHit / daySummaries.length) * 100
                  : 0
              }
            />
            <StatTile
              label="Top category"
              value={topCategory?.dayTotal ?? 0}
              sub={topCategory?.name ?? "Nothing logged yet"}
              icon={Flame}
              accent="violet"
            />
            <StatTile
              label="Remaining"
              value={daySummaries.reduce((n, s) => n + s.remaining, 0)}
              sub="Across every category target"
              icon={CalendarDays}
              accent="blue"
            />
          </div>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="inline-flex items-center gap-2 text-base font-bold tracking-tight">
                  <Zap className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                  Quick log
                </h2>
                <p className="text-xs text-muted-foreground">
                  One tap adds to {isToday ? "today" : format(parseISO(`${selectedDate}T00:00:00`), "d MMM")}
                  . Use the field for any other amount.
                </p>
              </div>
              {isFuture ? (
                <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-800 dark:text-amber-200">
                  Logging to a future date
                </span>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {activeCategories.map((category) => (
                <QuickLogCard
                  key={category.id}
                  category={category}
                  summary={summaryById.get(category.id) ?? null}
                  busyKey={quickBusy}
                  onQuickLog={(amount) => void quickLog(category, amount)}
                  onOpenDialog={() => openCreate(category.id)}
                />
              ))}
            </div>
          </section>

          <div className={listFilterCardClass}>
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="w-full min-w-[12rem] flex-1 sm:max-w-sm">
                <FilterLabel>Search</FilterLabel>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Category, note or value…"
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="w-full min-w-[11rem] flex-1 sm:max-w-[16rem]">
                <FilterLabel>Category</FilterLabel>
                <Select
                  value={filterCategoryId || SELECT_ALL}
                  onValueChange={(v) =>
                    setFilterCategoryId(v === SELECT_ALL ? "" : v)
                  }
                >
                  <SelectTrigger>
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
              <div className="w-full min-w-[10rem] sm:w-48">
                <FilterLabel>Sort</FilterLabel>
                <Select
                  value={sort}
                  onValueChange={(v) => setSort(v as SortKey)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest first</SelectItem>
                    <SelectItem value="oldest">Oldest first</SelectItem>
                    <SelectItem value="largest">Largest value</SelectItem>
                    <SelectItem value="category">By category</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {hasActiveFilters ? (
                <ClearFiltersButton
                  onClick={() => {
                    setFilterCategoryId("");
                    setSearch("");
                    setSort("newest");
                  }}
                />
              ) : null}
            </div>
          </div>

          <AppDataTable
            title={
              isToday
                ? "Today’s entries"
                : `Entries · ${format(parseISO(`${selectedDate}T00:00:00`), "d MMM yyyy")}`
            }
            totalCount={visibleEntries.length}
            loading={loading}
            empty={
              entries.length === 0
                ? "Nothing logged for this day yet. Use Quick log above."
                : "No entries match these filters."
            }
            minWidth={760}
          >
            <thead className={tableHeadRowClass}>
              <tr>
                <th className={tableHeadCellClass}>Time</th>
                <th className={tableHeadCellClass}>Category</th>
                <th className={tableHeadCellClass}>Value</th>
                <th className={tableHeadCellClass}>Day progress</th>
                <th className={tableHeadCellClass}>Note</th>
                <th className={`${tableHeadCellClass} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleEntries.map((entry) => (
                <tr key={entry.id} className={tableBodyRowClass}>
                  <td
                    className={`${tableBodyCellClass} tabular-nums text-muted-foreground`}
                  >
                    {entry.createdAt
                      ? new Date(entry.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </td>
                  <td className={`${tableBodyCellClass} font-semibold`}>
                    {entry.categoryName}
                  </td>
                  <td className={`${tableBodyCellClass} font-bold tabular-nums`}>
                    +{entry.value}
                  </td>
                  <td className={tableBodyCellClass}>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            entry.dayHitTarget ? "bg-emerald-500" : "bg-teal-500"
                          )}
                          style={{
                            width: `${Math.min(100, entry.dayProgress)}%`,
                          }}
                        />
                      </div>
                      <span
                        className={cn(
                          "text-[11px] font-bold tabular-nums",
                          entry.dayHitTarget
                            ? "text-emerald-700 dark:text-emerald-300"
                            : "text-muted-foreground"
                        )}
                      >
                        {entry.dayTotal}/{entry.categoryTarget}
                      </span>
                    </div>
                  </td>
                  <td
                    className={`${tableBodyCellClass} max-w-[18rem] truncate text-muted-foreground`}
                    title={entry.note || undefined}
                  >
                    {entry.note || "—"}
                  </td>
                  <td className={`${tableBodyCellClass} text-right`}>
                    <div className="inline-flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(entry)}
                        className="h-8 w-8"
                        title="Edit entry"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => void remove(entry)}
                        className="h-8 w-8 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                        title="Delete entry"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </AppDataTable>
        </>
      )}

      <Dialog
        isOpen={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditing(null);
        }}
        title={
          editing
            ? `Edit entry · ${format(parseISO(`${editing.date}T00:00:00`), "d MMM yyyy")}`
            : `Add entry · ${format(parseISO(`${selectedDate}T00:00:00`), "d MMM yyyy")}`
        }
        footer={
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDialogOpen(false);
                setEditing(null);
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="entry-form"
              loading={saving}
              disabled={activeCategories.length === 0}
              className="flex-1"
            >
              {editing ? "Save changes" : "Add entry"}
            </Button>
          </div>
        }
      >
        <form id="entry-form" onSubmit={onSubmit} className="space-y-4">
          <div>
            <FilterLabel>Category</FilterLabel>
            <Select
              value={categoryId || undefined}
              onValueChange={setCategoryId}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {activeCategories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} (daily target {c.target})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {summaryById.get(categoryId) ? (
            <div className="rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm">
              <p className="font-semibold">
                {summaryById.get(categoryId)!.name} so far:{" "}
                <span className="tabular-nums">
                  {summaryById.get(categoryId)!.dayTotal}/
                  {summaryById.get(categoryId)!.target}
                </span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {summaryById.get(categoryId)!.remaining > 0
                  ? `${summaryById.get(categoryId)!.remaining} left to reach the daily target.`
                  : "Daily target already met — extra entries still count."}
              </p>
            </div>
          ) : null}

          <div>
            <FilterLabel>Value</FilterLabel>
            <Input
              type="number"
              min={0}
              step="any"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. 20"
              required
              autoFocus
            />
          </div>
          <div>
            <FilterLabel>Note (optional)</FilterLabel>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What was this for?"
            />
          </div>
        </form>
      </Dialog>
    </PageShell>
  );
}

/** Prev/next day, a jump-to date picker, and a 14-day attainment strip. */
function DayNavigator({
  selectedDate,
  onSelect,
  strip,
}: {
  selectedDate: string;
  onSelect: (iso: string) => void;
  strip: AnalyticsResponse["dailyTargetHits"];
}) {
  const today = todayIso();
  const parsed = parseISO(`${selectedDate}T00:00:00`);

  return (
    <div className={listFilterCardClass}>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Previous day"
            onClick={() => onSelect(shiftIso(selectedDate, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Next day"
            onClick={() => onSelect(shiftIso(selectedDate, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-w-0">
          <p className="text-sm font-bold tracking-tight">
            {format(parsed, "EEEE, d MMMM yyyy")}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {selectedDate === today
              ? "Today"
              : selectedDate === shiftIso(today, -1)
                ? "Yesterday"
                : format(parsed, "dd/MM/yyyy")}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {selectedDate !== today ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onSelect(today)}
            >
              Today
            </Button>
          ) : null}
          <div className="w-44">
            <DatePicker
              value={selectedDate}
              onChange={(iso) => iso && onSelect(iso)}
            />
          </div>
        </div>
      </div>

      {strip.length > 0 ? (
        <div className="overflow-x-auto border-t border-border px-4 py-3">
          <div className="flex gap-1.5">
            {strip.map((day) => {
              const active = day.date === selectedDate;
              const full = day.total > 0 && day.hits === day.total;
              const partial = day.hits > 0 && !full;
              return (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => onSelect(day.date)}
                  title={`${day.date} · ${day.hits}/${day.total} targets hit · ${day.value} logged`}
                  className={cn(
                    "flex min-w-[3.25rem] shrink-0 flex-col items-center gap-1 rounded-lg border px-2 py-1.5 transition",
                    active
                      ? "border-teal-500 bg-teal-500/10"
                      : "border-border bg-card hover:bg-muted/50"
                  )}
                >
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                    {day.weekday}
                  </span>
                  <span
                    className={cn(
                      "text-sm font-bold tabular-nums leading-none",
                      active && "text-teal-700 dark:text-teal-300"
                    )}
                  >
                    {day.date.slice(-2)}
                  </span>
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      full
                        ? "bg-emerald-500"
                        : partial
                          ? "bg-amber-500"
                          : day.entryCount > 0
                            ? "bg-rose-400"
                            : "bg-muted-foreground/25"
                    )}
                  />
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function QuickLogCard({
  category,
  summary,
  busyKey,
  onQuickLog,
  onOpenDialog,
}: {
  category: Category;
  summary: DaySummary | null;
  busyKey: string | null;
  onQuickLog: (amount: number) => void;
  onOpenDialog: () => void;
}) {
  const [custom, setCustom] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const total = summary?.dayTotal ?? 0;
  const progress = summary?.progress ?? 0;
  const hit = summary?.hitTarget ?? false;
  const presets = quickAmounts(category.target);

  function submitCustom() {
    const num = Number(custom);
    if (!Number.isFinite(num) || num <= 0) {
      toast.error("Enter an amount greater than zero");
      inputRef.current?.focus();
      return;
    }
    onQuickLog(num);
    setCustom("");
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm transition",
        hit ? "border-emerald-400/60" : "border-border"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-bold tracking-tight">{category.name}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Daily target {category.target}
            {summary ? ` · ${summary.entryCount} entr${summary.entryCount === 1 ? "y" : "ies"}` : ""}
          </p>
        </div>
        {hit ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            <Check className="h-3 w-3" /> Hit
          </span>
        ) : null}
      </div>

      <div>
        <p className="text-2xl font-bold tabular-nums tracking-tight">
          {total}
          <span className="text-base font-semibold text-muted-foreground">
            {" "}
            / {category.target}
          </span>
        </p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              hit ? "bg-emerald-500" : "bg-teal-500"
            )}
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
        <p className="mt-1.5 text-[11px] font-semibold text-muted-foreground">
          {progress}% of target
          {total > category.target
            ? ` · +${Math.round((total - category.target) * 100) / 100} over`
            : summary && summary.remaining > 0
              ? ` · ${summary.remaining} remaining`
              : ""}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {presets.map((amount) => {
          const busy = busyKey === `${category.id}:${amount}`;
          return (
            <Button
              key={amount}
              type="button"
              variant="secondary"
              size="sm"
              loading={busy}
              onClick={() => onQuickLog(amount)}
              className="tabular-nums"
            >
              {busy ? null : <Plus className="h-3.5 w-3.5" />}
              {amount}
            </Button>
          );
        })}
      </div>

      <div className="mt-auto flex gap-2">
        <Input
          ref={inputRef}
          type="number"
          min={0}
          step="any"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitCustom();
            }
          }}
          placeholder="Other amount"
          aria-label={`Custom amount for ${category.name}`}
          className="h-9"
        />
        <Button
          type="button"
          size="sm"
          onClick={submitCustom}
          disabled={custom.trim() === ""}
          className="shrink-0"
        >
          Add
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onOpenDialog}
          title="Add with a note"
          className="shrink-0"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
