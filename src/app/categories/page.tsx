"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Search } from "lucide-react";
import toast from "react-hot-toast";
import { api, ApiError } from "@/lib/client-api";
import { PageHeader, PageShell } from "@/components/layout/PageShell";
import { Dialog } from "@/components/ui/Dialog";
import { AppDataTable, StatusBadge } from "@/components/ui/AppDataTable";
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
import type { Category } from "@/types";

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">(
    "all"
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("100");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<Category[]>(
        "/api/categories?includeInactive=true"
      );
      setCategories(data);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return categories.filter((c) => {
      if (statusFilter === "active" && !c.isActive) return false;
      if (statusFilter === "inactive" && c.isActive) return false;
      if (q && !c.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [categories, search, statusFilter]);

  function openCreate() {
    setEditingId(null);
    setName("");
    setTarget("100");
    setDialogOpen(true);
  }

  function openEdit(cat: Category) {
    setEditingId(cat.id);
    setName(cat.name);
    setTarget(String(cat.target));
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingId(null);
    setName("");
    setTarget("100");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const targetNum = Number(target);
    if (!name.trim() || !Number.isFinite(targetNum) || targetNum < 1) {
      toast.error("Name and target (minimum 1) are required");
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await api(`/api/categories/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify({ name: name.trim(), target: targetNum }),
        });
        toast.success("Category updated");
      } else {
        await api("/api/categories", {
          method: "POST",
          body: JSON.stringify({ name: name.trim(), target: targetNum }),
        });
        toast.success("Category created");
      }
      closeDialog();
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(id: string) {
    if (!confirm("Deactivate this category?")) return;
    try {
      await api(`/api/categories/${id}`, { method: "DELETE" });
      toast.success("Category deactivated");
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed");
    }
  }

  async function reactivate(id: string) {
    try {
      await api(`/api/categories/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: true }),
      });
      toast.success("Category reactivated");
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed");
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Category Master"
        description="Create categories with a daily target (e.g. Pushups → 100 per day)."
        action={
          <button type="button" onClick={openCreate} className={primaryButtonClass}>
            <Plus className="h-4 w-4" />
            Add Category
          </button>
        }
      />

      <div className={listFilterCardClass}>
        <div className="flex flex-wrap items-end gap-4 px-4 py-3">
          <label className="min-w-[200px] flex-1">
            <span className={filterLabelClass}>Search</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search category name..."
                className={`${filterInputClass} pl-9`}
              />
            </div>
          </label>
          <label className="w-full sm:w-44">
            <span className={filterLabelClass}>Status</span>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as typeof statusFilter)
              }
              className={filterInputClass}
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
        </div>
      </div>

      <AppDataTable
        title="All categories"
        totalCount={filtered.length}
        loading={loading}
        empty="No categories yet. Click Add Category to create one."
        minWidth={560}
      >
        <thead className={tableHeadRowClass}>
          <tr>
            <th className={tableHeadCellClass}>Name</th>
            <th className={tableHeadCellClass}>Daily target</th>
            <th className={tableHeadCellClass}>Status</th>
            <th className={`${tableHeadCellClass} text-right`}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((cat) => (
            <tr key={cat.id} className={tableBodyRowClass}>
              <td className={`${tableBodyCellClass} font-semibold`}>
                {cat.name}
              </td>
              <td className={`${tableBodyCellClass} tabular-nums`}>
                {cat.target}
              </td>
              <td className={tableBodyCellClass}>
                <StatusBadge active={cat.isActive} />
              </td>
              <td className={`${tableBodyCellClass} text-right`}>
                <div className="inline-flex gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(cat)}
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs font-semibold hover:bg-muted"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  {cat.isActive ? (
                    <button
                      type="button"
                      onClick={() => void deactivate(cat.id)}
                      className="inline-flex h-8 items-center rounded-md border border-rose-200 px-2.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950/40"
                    >
                      Deactivate
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void reactivate(cat.id)}
                      className="inline-flex h-8 items-center rounded-md border border-border px-2.5 text-xs font-semibold hover:bg-muted"
                    >
                      Reactivate
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </AppDataTable>

      <Dialog
        isOpen={dialogOpen}
        onClose={closeDialog}
        title={editingId ? "Edit Category" : "Add Category"}
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={closeDialog}
              className={`${outlineButtonClass} flex-1`}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="category-form"
              disabled={saving}
              className={`${primaryButtonClass} flex-1`}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editingId ? "Update" : "Save"}
            </button>
          </div>
        }
      >
        <form id="category-form" onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className={filterLabelClass}>Category name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Pushups"
              className={filterInputClass}
              required
              autoFocus
            />
          </label>
          <label className="block">
            <span className={filterLabelClass}>Daily target (minimum 1)</span>
            <input
              type="number"
              min={1}
              step={1}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className={filterInputClass}
              required
            />
          </label>
        </form>
      </Dialog>
    </PageShell>
  );
}
