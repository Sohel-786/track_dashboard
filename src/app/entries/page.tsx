"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  Plus,
  Target,
  Trash2,
} from "lucide-react";
import toast from "react-hot-toast";
import { api, ApiError } from "@/lib/client-api";
import { todayIso } from "@/lib/date-ranges";
import { PageHeader, PageShell } from "@/components/layout/PageShell";
import { Dialog } from "@/components/ui/Dialog";
import { AppDataTable } from "@/components/ui/AppDataTable";
import {
  filterInputClass,
  filterLabelClass,
  listFilterCardClass,
  outlineButtonClass,
  primaryButtonClass,
  tableBodyCellClass,
  tableBodyRowClass,
  tableHeadCellClass,
  tableHeadRowClass,
} from "@/lib/ui-styles";
import { cn } from "@/lib/utils";
import type { Category, DaySummary, EntriesResponse, Entry } from "@/types";

export default function EntriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [daySummaries, setDaySummaries] = useState<DaySummary[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filterCategoryId, setFilterCategoryId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ date: selectedDate, limit: "500" });
      if (filterCategoryId) params.set("categoryId", filterCategoryId);

      const [cats, payload] = await Promise.all([
        api<Category[]>("/api/categories"),
        api<EntriesResponse>(`/api/entries?${params.toString()}`),
      ]);
      setCategories(cats);
      setEntries(payload.entries);
      setDaySummaries(payload.daySummaries);
      if (!categoryId && cats[0]) setCategoryId(cats[0].id);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [selectedDate, filterCategoryId, categoryId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, filterCategoryId]);

  const selectedCategorySummary = useMemo(() => {
    if (!categoryId) return null;
    return daySummaries.find((s) => s.categoryId === categoryId) ?? null;
  }, [daySummaries, categoryId]);

  const isToday = selectedDate === todayIso();

  function openCreate() {
    setValue("");
    setNote("");
    if (categories[0] && !categoryId) setCategoryId(categories[0].id);
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
      await api("/api/entries", {
        method: "POST",
        body: JSON.stringify({
          categoryId,
          value: num,
          date: selectedDate,
          note: note.trim() || undefined,
        }),
      });
      toast.success("Entry added");
      setDialogOpen(false);
      setValue("");
      setNote("");
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this entry?")) return;
    try {
      await api(`/api/entries/${id}`, { method: "DELETE" });
      toast.success("Entry deleted");
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Daily Entries"
        description="Log multiple values toward each category’s daily target. Targets reset every day."
        action={
          <button
            type="button"
            onClick={openCreate}
            disabled={categories.length === 0}
            className={primaryButtonClass}
          >
            <Plus className="h-4 w-4" />
            Add Entry
          </button>
        }
      />

      <div className={listFilterCardClass}>
        <div className="flex flex-wrap items-end gap-4 px-4 py-3">
          <label className="w-full sm:w-48">
            <span className={filterLabelClass}>Day</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className={filterInputClass}
            />
          </label>
          <label className="min-w-[180px] flex-1 sm:max-w-xs">
            <span className={filterLabelClass}>Category filter</span>
            <select
              value={filterCategoryId}
              onChange={(e) => setFilterCategoryId(e.target.value)}
              className={filterInputClass}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setSelectedDate(todayIso())}
            className={cn(
              outlineButtonClass,
              isToday && "border-teal-500 text-teal-700 dark:text-teal-300"
            )}
          >
            {isToday ? "Viewing today" : "Jump to today"}
          </button>
        </div>
      </div>

      {categories.length === 0 && !loading ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          Create a category in Category Master before logging entries.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {daySummaries.map((s) => (
          <div
            key={s.categoryId}
            className={cn(
              "rounded-xl border bg-card p-4 shadow-sm",
              s.hitTarget
                ? "border-emerald-300 dark:border-emerald-800"
                : "border-border"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-bold">{s.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Daily target {s.target} · {s.entryCount} entr
                  {s.entryCount === 1 ? "y" : "ies"}
                </p>
              </div>
              {s.hitTarget ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
              ) : (
                <Target className="h-5 w-5 shrink-0 text-muted-foreground" />
              )}
            </div>
            <p className="mt-3 text-2xl font-bold tabular-nums">
              {s.dayTotal}
              <span className="text-base font-semibold text-muted-foreground">
                {" "}
                / {s.target}
              </span>
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  s.hitTarget ? "bg-emerald-500" : "bg-teal-500"
                )}
                style={{ width: `${Math.min(100, s.progress)}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] font-semibold text-muted-foreground">
              {s.progress}% of daily target
              {s.dayTotal > s.target
                ? ` · +${s.dayTotal - s.target} over`
                : s.remaining > 0
                  ? ` · ${s.remaining} remaining`
                  : ""}
            </p>
          </div>
        ))}
      </div>

      <AppDataTable
        title={isToday ? "Today's entries" : `Entries · ${selectedDate}`}
        totalCount={entries.length}
        loading={loading}
        empty="No entries for this day yet. Click Add Entry to log a value."
        minWidth={720}
      >
        <thead className={tableHeadRowClass}>
          <tr>
            <th className={tableHeadCellClass}>Time</th>
            <th className={tableHeadCellClass}>Category</th>
            <th className={tableHeadCellClass}>Value</th>
            <th className={tableHeadCellClass}>Daily target</th>
            <th className={tableHeadCellClass}>Day total</th>
            <th className={tableHeadCellClass}>vs Target</th>
            <th className={tableHeadCellClass}>Note</th>
            <th className={`${tableHeadCellClass} text-right`}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className={tableBodyRowClass}>
              <td className={`${tableBodyCellClass} tabular-nums text-muted-foreground`}>
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
              <td className={`${tableBodyCellClass} tabular-nums`}>
                {entry.categoryTarget}
              </td>
              <td className={`${tableBodyCellClass} font-semibold tabular-nums`}>
                {entry.dayTotal}
              </td>
              <td className={tableBodyCellClass}>
                <span
                  className={cn(
                    "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase",
                    entry.dayHitTarget
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                  )}
                >
                  {entry.dayTotal}/{entry.categoryTarget} ({entry.dayProgress}%)
                </span>
              </td>
              <td className={`${tableBodyCellClass} text-muted-foreground`}>
                {entry.note || "—"}
              </td>
              <td className={`${tableBodyCellClass} text-right`}>
                <button
                  type="button"
                  onClick={() => void remove(entry.id)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </AppDataTable>

      <Dialog
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={`Add entry · ${selectedDate}`}
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDialogOpen(false)}
              className={`${outlineButtonClass} flex-1`}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="entry-form"
              disabled={saving || categories.length === 0}
              className={`${primaryButtonClass} flex-1`}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Add
            </button>
          </div>
        }
      >
        <form id="entry-form" onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className={filterLabelClass}>Category</span>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={filterInputClass}
              required
            >
              <option value="" disabled>
                Select category
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} (daily target {c.target})
                </option>
              ))}
            </select>
          </label>

          {selectedCategorySummary ? (
            <div className="rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm">
              <p className="font-semibold">
                {selectedCategorySummary.name} today so far:{" "}
                <span className="tabular-nums">
                  {selectedCategorySummary.dayTotal}/{selectedCategorySummary.target}
                </span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                You can add another small entry — totals can exceed the daily
                target.
              </p>
            </div>
          ) : null}

          <label className="block">
            <span className={filterLabelClass}>Value</span>
            <input
              type="number"
              min={0}
              step="any"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. 20"
              className={filterInputClass}
              required
              autoFocus
            />
          </label>
          <label className="block">
            <span className={filterLabelClass}>Note (optional)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note"
              className={filterInputClass}
            />
          </label>
        </form>
      </Dialog>
    </PageShell>
  );
}
