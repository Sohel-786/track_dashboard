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
          ? "border-emerald-400 bg-emerald-500/12 text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-400/12 dark:text-emerald-200"
          : "border-rose-400 bg-rose-500/12 text-rose-800 dark:border-rose-400/40 dark:bg-rose-400/12 dark:text-rose-200"
      )}
    >
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}
