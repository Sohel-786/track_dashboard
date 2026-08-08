"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Search, UserPlus } from "lucide-react";
import toast from "react-hot-toast";
import { api, ApiError } from "@/lib/client-api";
import { useAuth } from "@/components/AuthProvider";
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
import type { AuthUser, UserRole } from "@/types";

type ManagedUser = AuthUser & {
  isActive: boolean;
  createdAt?: string;
};

export default function UsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<UserRole>("user");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<ManagedUser[]>("/api/users");
      setUsers(data);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === "admin") void load();
  }, [user, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
    );
  }, [users, search]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/users", {
        method: "POST",
        body: JSON.stringify({ username, password, name, role }),
      });
      toast.success("User created");
      setDialogOpen(false);
      setUsername("");
      setPassword("");
      setName("");
      setRole("user");
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(u: ManagedUser) {
    try {
      await api(`/api/users/${u.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !u.isActive }),
      });
      toast.success(u.isActive ? "User deactivated" : "User activated");
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Update failed");
    }
  }

  if (user && user.role !== "admin") {
    return (
      <PageShell>
        <p className="py-16 text-center text-sm text-muted-foreground">
          Admin access required.
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="Users"
        description="Admin-only. Create users who will each own their own categories and entries."
        action={
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className={primaryButtonClass}
          >
            <UserPlus className="h-4 w-4" />
            Add User
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
                placeholder="Search name, username, role..."
                className={`${filterInputClass} pl-9`}
              />
            </div>
          </label>
        </div>
      </div>

      <AppDataTable
        title="All users"
        totalCount={filtered.length}
        loading={loading}
        empty="No users found."
        minWidth={560}
      >
        <thead className={tableHeadRowClass}>
          <tr>
            <th className={tableHeadCellClass}>Name</th>
            <th className={tableHeadCellClass}>Username</th>
            <th className={tableHeadCellClass}>Role</th>
            <th className={tableHeadCellClass}>Status</th>
            <th className={`${tableHeadCellClass} text-right`}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((u) => (
            <tr key={u.id} className={tableBodyRowClass}>
              <td className={`${tableBodyCellClass} font-semibold`}>
                {u.name}
              </td>
              <td className={tableBodyCellClass}>@{u.username}</td>
              <td className={`${tableBodyCellClass} capitalize`}>{u.role}</td>
              <td className={tableBodyCellClass}>
                <StatusBadge active={u.isActive} />
              </td>
              <td className={`${tableBodyCellClass} text-right`}>
                <button
                  type="button"
                  disabled={u.id === user?.id}
                  onClick={() => void toggleActive(u)}
                  className="inline-flex h-8 items-center rounded-md border border-border px-2.5 text-xs font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {u.isActive ? "Deactivate" : "Activate"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </AppDataTable>

      <Dialog
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="Add User"
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
              form="user-form"
              disabled={saving}
              className={`${primaryButtonClass} flex-1`}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Create
            </button>
          </div>
        }
      >
        <form id="user-form" onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className={filterLabelClass}>Display name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={filterInputClass}
              required
              autoFocus
            />
          </label>
          <label className="block">
            <span className={filterLabelClass}>Username</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={filterInputClass}
              required
              minLength={3}
            />
          </label>
          <label className="block">
            <span className={filterLabelClass}>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={filterInputClass}
              required
              minLength={4}
            />
          </label>
          <label className="block">
            <span className={filterLabelClass}>Role</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className={filterInputClass}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </label>
        </form>
      </Dialog>
    </PageShell>
  );
}
