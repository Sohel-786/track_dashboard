import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function AppDataTable({
  title,
  totalCount,
  children,
  empty,
  loading,
  minWidth = 640,
  footer,
}: {
  title: string;
  totalCount?: number;
  children: ReactNode;
  empty?: ReactNode;
  loading?: boolean;
  minWidth?: number;
  footer?: ReactNode;
}) {
  const isEmpty =
    !loading && totalCount !== undefined && totalCount === 0 && empty != null;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-4 py-3 sm:px-6 sm:py-4">
        <h3 className="text-base font-bold tracking-tight sm:text-lg">
          {title}
          {totalCount !== undefined ? ` (${totalCount})` : ""}
        </h3>
      </div>
      {loading ? (
        <div className="px-4 py-14 text-center text-sm text-muted-foreground">
          Loading...
        </div>
      ) : isEmpty ? (
        <div className="px-4 py-14 text-center text-sm text-muted-foreground">
          {empty}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table
            className={cn("w-full text-left text-sm whitespace-nowrap")}
            style={{ minWidth }}
          >
            {children}
          </table>
        </div>
      )}
      {footer ? (
        <div className="border-t border-border px-4 py-3 sm:px-6">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

export function StatusBadge({
  active,
  activeLabel = "Active",
  inactiveLabel = "Inactive",
}: {
  active: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        active
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
          : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
      )}
    >
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}
