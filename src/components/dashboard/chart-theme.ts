export const CHART_TICK = {
  fontSize: 11,
  fill: "hsl(var(--muted-foreground))",
} as const;

export const CHART_GRID_STROKE = "hsl(var(--border))";

export const CHART_TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "10px",
    color: "hsl(var(--foreground))",
    fontSize: "12px",
    boxShadow: "0 8px 24px -8px rgba(0,0,0,0.25)",
  },
  labelStyle: { color: "hsl(var(--foreground))", fontWeight: 700 },
  itemStyle: { color: "hsl(var(--foreground))" },
  cursor: { fill: "hsl(var(--muted-foreground))", fillOpacity: 0.08 },
};

export const BAR_PALETTE = [
  "bg-teal-500",
  "bg-violet-500",
  "bg-blue-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-orange-500",
  "bg-cyan-500",
  "bg-rose-500",
];

/**
 * Categorical series colours. Mid-tone hues chosen to stay legible on both the
 * light (#fff) and dark (#0b1220) card surfaces without per-theme swapping.
 */
export const SERIES_COLORS = [
  "#14b8a6",
  "#8b5cf6",
  "#3b82f6",
  "#f59e0b",
  "#10b981",
  "#f97316",
  "#06b6d4",
  "#ec4899",
];

/** Semantic colours shared by every chart in the app. */
export const SEMANTIC_COLORS = {
  positive: "#10b981",
  warning: "#f59e0b",
  negative: "#f43f5e",
  neutral: "#94a3b8",
  accent: "#14b8a6",
  info: "#6366f1",
  violet: "#8b5cf6",
} as const;

export type StatAccent = {
  /** Value + icon colour. */
  text: string;
  /** Soft tinted surface behind the icon. */
  chip: string;
  /** Solid fill for progress bars. */
  bar: string;
  /** Thin left rail on the tile. */
  rail: string;
};

/**
 * Stat-tile accents. Neutral card + one tinted accent reads calmer at a glance
 * than fully saturated gradient tiles, and keeps the number the loudest thing.
 */
export const STAT_ACCENTS = {
  teal: {
    text: "text-teal-700 dark:text-teal-300",
    chip: "bg-teal-500/12 text-teal-700 dark:text-teal-300",
    bar: "bg-teal-500",
    rail: "bg-teal-500",
  },
  emerald: {
    text: "text-emerald-700 dark:text-emerald-300",
    chip: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
    bar: "bg-emerald-500",
    rail: "bg-emerald-500",
  },
  amber: {
    text: "text-amber-700 dark:text-amber-300",
    chip: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
    bar: "bg-amber-500",
    rail: "bg-amber-500",
  },
  rose: {
    text: "text-rose-700 dark:text-rose-300",
    chip: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
    bar: "bg-rose-500",
    rail: "bg-rose-500",
  },
  violet: {
    text: "text-violet-700 dark:text-violet-300",
    chip: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
    bar: "bg-violet-500",
    rail: "bg-violet-500",
  },
  blue: {
    text: "text-blue-700 dark:text-blue-300",
    chip: "bg-blue-500/12 text-blue-700 dark:text-blue-300",
    bar: "bg-blue-500",
    rail: "bg-blue-500",
  },
  indigo: {
    text: "text-indigo-700 dark:text-indigo-300",
    chip: "bg-indigo-500/12 text-indigo-700 dark:text-indigo-300",
    bar: "bg-indigo-500",
    rail: "bg-indigo-500",
  },
  slate: {
    text: "text-foreground",
    chip: "bg-muted text-muted-foreground",
    bar: "bg-slate-400",
    rail: "bg-slate-400",
  },
} as const satisfies Record<string, StatAccent>;

export type StatAccentKey = keyof typeof STAT_ACCENTS;
