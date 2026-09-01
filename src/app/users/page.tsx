"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  RefreshCw,
  Search,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import toast from "react-hot-toast";
import { api, ApiError } from "@/lib/client-api";
import { todayIso, trackingStartLabel } from "@/lib/date-ranges";
import { generatePassword } from "@/lib/generate-password";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/AuthProvider";
import { PageHeader, PageShell } from "@/components/layout/PageShell";
import { Dialog } from "@/components/ui/Dialog";
import { AppDataTable, StatusBadge } from "@/components/ui/AppDataTable";
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
} from "@/components/ui/select";
import {
  listFilterCardClass,
  tableBodyCellClass,
  tableBodyRowClass,
  tableHeadCellClass,
  tableHeadRowClass,
} from "@/lib/ui-styles";
import type { AdminUser, UserRole } from "@/types";

type ManagedUser = AdminUser;

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
  const [startDate, setStartDate] = useState<string>(todayIso());
  const [startEditing, setStartEditing] = useState<ManagedUser | null>(null);
  const [startDraft, setStartDraft] = useState<string>("");
  const [startSaving, setStartSaving] = useState(false);

  /**
   * Password reset. The dialog runs in two phases: compose the new password,
   * then — once saved — hold it on screen so it can still be copied. Closing
   * early is the one way to lose it, since nothing can read the hash back.
   */
  const [resetTarget, setResetTarget] = useState<ManagedUser | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetVisible, setResetVisible] = useState(false);
  const [resetSaving, setResetSaving] = useState(false);
  const [resetDone, setResetDone] = useState(false);

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

  const hasActiveFilters = search.trim() !== "";

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
        body: JSON.stringify({
          username,
          password,
          name,
          role,
          trackingStartDate: startDate || undefined,
        }),
      });
      toast.success("User created");
      setDialogOpen(false);
      setUsername("");
      setPassword("");
      setName("");
      setRole("user");
      setStartDate(todayIso());
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

  function openReset(u: ManagedUser) {
    setResetTarget(u);
    setResetPassword("");
    setResetVisible(false);
    setResetDone(false);
  }

  function closeReset() {
    setResetTarget(null);
    setResetPassword("");
    setResetVisible(false);
    setResetDone(false);
  }

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(resetPassword);
      toast.success("Password copied");
    } catch {
      toast.error("Could not copy — select the password and copy it manually");
    }
  }

  async function submitReset(e: FormEvent) {
    e.preventDefault();
    if (!resetTarget) return;
    setResetSaving(true);
    try {
      await api(`/api/users/${resetTarget.id}`, {
        method: "PATCH",
        body: JSON.stringify({ password: resetPassword }),
      });
      // Keep the password on screen — this is the last chance to copy it.
      setResetDone(true);
      setResetVisible(true);
      toast.success(`Password reset for @${resetTarget.username}`);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Reset failed");
    } finally {
      setResetSaving(false);
    }
  }

  function openStartEditor(u: ManagedUser) {
    setStartEditing(u);
    setStartDraft(u.trackingStartDate ?? u.trackingStart);
  }

  /** `clear` drops the override so the account falls back to its creation day. */
  async function saveTrackingStart(clear = false) {
    if (!startEditing) return;
    setStartSaving(true);
    try {
      await api(`/api/users/${startEditing.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          trackingStartDate: clear ? null : startDraft,
        }),
      });
      toast.success(
        clear
          ? "Reset to the account creation day"
          : `Tracking starts ${trackingStartLabel(startDraft)}`
      );
      setStartEditing(null);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Update failed");
    } finally {
      setStartSaving(false);
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
        action={
          <Button type="button" onClick={() => setDialogOpen(true)}>
            <UserPlus />
            Add User
          </Button>
        }
      />

      <div className={listFilterCardClass}>
        <div className="flex flex-wrap items-end gap-4 px-4 py-3">
          <div className="min-w-[200px] flex-1">
            <FilterLabel>Search</FilterLabel>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, username, role..."
                className="pl-9"
              />
            </div>
          </div>
          {hasActiveFilters ? (
            <ClearFiltersButton onClick={() => setSearch("")} />
          ) : null}
        </div>
      </div>

      <AppDataTable
        title="All users"
        totalCount={filtered.length}
        loading={loading}
        empty="No users found."
        minWidth={720}
      >
        <thead className={tableHeadRowClass}>
          <tr>
            <th className={tableHeadCellClass}>Name</th>
            <th className={tableHeadCellClass}>Username</th>
            <th className={tableHeadCellClass}>Role</th>
            <th className={tableHeadCellClass}>Tracking from</th>
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
                <button
                  type="button"
                  onClick={() => openStartEditor(u)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-left text-xs font-semibold transition hover:border-teal-500 hover:bg-teal-500/8"
                  title="Change the first day this account tracks"
                >
                  <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="tabular-nums">
                    {trackingStartLabel(u.trackingStart)}
                  </span>
                  {u.trackingStartIsImplicit ? (
                    <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                      auto
                    </span>
                  ) : null}
                </button>
              </td>
              <td className={tableBodyCellClass}>
                <StatusBadge active={u.isActive} />
              </td>
              <td className={`${tableBodyCellClass} text-right`}>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openReset(u)}
                    title={`Set a new password for @${u.username}`}
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    Reset password
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={u.id === user?.id}
                    onClick={() => void toggleActive(u)}
                  >
                    {u.isActive ? "Deactivate" : "Activate"}
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </AppDataTable>

      <Dialog
        isOpen={resetTarget !== null}
        onClose={closeReset}
        title={
          resetTarget ? `Reset password · ${resetTarget.name}` : "Reset password"
        }
        footer={
          resetDone ? (
            <Button type="button" onClick={closeReset} className="w-full">
              Done
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={closeReset}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="reset-password-form"
                loading={resetSaving}
                disabled={resetPassword.length < 8}
                className="flex-1"
              >
                {resetSaving ? null : <KeyRound className="h-4 w-4" />}
                Reset password
              </Button>
            </div>
          )
        }
      >
        {resetTarget ? (
          <form
            id="reset-password-form"
            onSubmit={submitReset}
            className="space-y-4"
          >
            {resetDone ? (
              <div className="flex gap-3 rounded-xl border border-emerald-500/50 bg-emerald-500/12 px-3 py-3 text-emerald-900 dark:border-emerald-400/50 dark:bg-emerald-400/12 dark:text-emerald-100">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 text-xs">
                  <p className="font-bold">
                    Password reset for @{resetTarget.username}
                  </p>
                  <p className="mt-0.5">
                    Copy it now and hand it over — once this closes it cannot be
                    read back, only reset again.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex gap-3 rounded-xl border border-amber-500/50 bg-amber-500/12 px-3 py-3 text-amber-900 dark:border-amber-400/50 dark:bg-amber-400/12 dark:text-amber-100">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 text-xs">
                  {resetTarget.id === user?.id ? (
                    <>
                      <p className="font-bold">This is your own account.</p>
                      <p className="mt-0.5">
                        You stay signed in here, but every other device signed in
                        as @{resetTarget.username} is signed out immediately.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-bold">
                        @{resetTarget.username} is signed out everywhere.
                      </p>
                      <p className="mt-0.5">
                        Every device signed in as this account stops working the
                        moment you reset, and needs the new password to return.
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}

            <div>
              <FilterLabel>New password</FilterLabel>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={resetVisible ? "text" : "password"}
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    readOnly={resetDone}
                    required
                    minLength={8}
                    maxLength={128}
                    autoComplete="new-password"
                    spellCheck={false}
                    placeholder="At least 8 characters"
                    className={cn(
                      "pr-10 font-mono",
                      resetDone && "bg-muted/50"
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setResetVisible((v) => !v)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    aria-label={
                      resetVisible ? "Hide password" : "Show password"
                    }
                  >
                    {resetVisible ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void copyPassword()}
                  disabled={!resetPassword}
                  title="Copy to clipboard"
                  aria-label="Copy password to clipboard"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>

              {resetDone ? null : (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    setResetPassword(generatePassword());
                    setResetVisible(true);
                  }}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Generate a strong password
                </Button>
              )}
            </div>

            {resetDone ? null : (
              <p className="rounded-xl border border-border bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
                {resetTarget.passwordChangedAt
                  ? `Last changed ${format(
                      parseISO(resetTarget.passwordChangedAt),
                      "d MMM yyyy · h:mm a"
                    )}.`
                  : "Still on the password this account was created with."}{" "}
                Nothing is emailed — pass the new password on yourself.
              </p>
            )}
          </form>
        ) : null}
      </Dialog>

      <Dialog
        isOpen={startEditing !== null}
        onClose={() => setStartEditing(null)}
        title={
          startEditing
            ? `Tracking start · ${startEditing.name}`
            : "Tracking start"
        }
        footer={
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void saveTrackingStart(true)}
              disabled={startSaving || startEditing?.trackingStartIsImplicit}
              className="flex-1"
            >
              Reset to auto
            </Button>
            <Button
              type="button"
              loading={startSaving}
              onClick={() => void saveTrackingStart(false)}
              className="flex-1"
            >
              Save
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The first day this account counts. Nothing before it is ever shown as
            a missed prayer, charted as an empty day, or accepted as an entry.
          </p>
          <div>
            <FilterLabel>First tracked day</FilterLabel>
            <DatePicker
              value={startDraft}
              maxIso={todayIso()}
              onChange={(iso) => iso && setStartDraft(iso)}
            />
          </div>
          {startEditing ? (
            <p className="rounded-xl border border-border bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
              {startEditing.trackingStartIsImplicit
                ? "Currently automatic — derived from the day this account was created."
                : `Currently overridden to ${trackingStartLabel(startEditing.trackingStart)}.`}
            </p>
          ) : null}
        </div>
      </Dialog>

      <Dialog
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="Add User"
        footer={
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="user-form"
              loading={saving}
              className="flex-1"
            >
              Create
            </Button>
          </div>
        }
      >
        <form id="user-form" onSubmit={onSubmit} className="space-y-4">
          <div>
            <FilterLabel>Display name</FilterLabel>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div>
            <FilterLabel>Username</FilterLabel>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
            />
          </div>
          <div>
            <FilterLabel>Password</FilterLabel>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <div>
            <FilterLabel>Role</FilterLabel>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as UserRole)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <FilterLabel>Tracking starts</FilterLabel>
            <DatePicker
              value={startDate}
              maxIso={todayIso()}
              onChange={(iso) => iso && setStartDate(iso)}
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Days before this are never counted as missed prayers. Defaults to
              today, so a new account starts with a clean slate.
            </p>
          </div>
        </form>
      </Dialog>
    </PageShell>
  );
}
