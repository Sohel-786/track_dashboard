export const filterLabelClass =
  "mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground";

export const filterInputClass =
  "h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20";

export const listFilterCardClass =
  "overflow-visible rounded-xl border border-border bg-card shadow-sm";

/* teal-700, not -600: white on -600 is 3.2:1 and fails AA. */
export const primaryButtonClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-teal-800 disabled:opacity-60";

export const outlineButtonClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:bg-muted disabled:opacity-60";

export const tableHeadRowClass =
  "border-b border-teal-300 bg-teal-100 text-teal-900 dark:border-teal-400/30 dark:bg-teal-400/10 dark:text-teal-100";

export const tableHeadCellClass =
  "px-3 py-2.5 text-[10px] font-bold uppercase tracking-wide sm:px-4 sm:py-3 sm:text-xs";

export const tableBodyRowClass =
  "border-b border-border transition-colors hover:bg-teal-500/8 dark:hover:bg-teal-400/8";

export const tableBodyCellClass = "px-3 py-2.5 align-middle sm:px-4 sm:py-3";
