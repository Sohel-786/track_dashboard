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
  "bg-teal-600 dark:bg-teal-400",
  "bg-violet-600 dark:bg-violet-400",
  "bg-blue-600 dark:bg-blue-400",
  "bg-amber-700 dark:bg-amber-400",
  "bg-emerald-600 dark:bg-emerald-400",
  "bg-orange-600 dark:bg-orange-400",
  "bg-cyan-600 dark:bg-cyan-400",
  "bg-rose-600 dark:bg-rose-400",
];

/**
 * Categorical series colours. Every entry clears 3:1 against BOTH the light
 * card (#fff) and the dark card, so one palette serves both themes — verified
 * by scripts/check-contrast.ts.
 */
export const SERIES_COLORS = [
  "#0d9488",
  "#8b5cf6",
  "#3b82f6",
  "#d97706",
  "#059669",
  "#ea580c",
  "#0891b2",
  "#db2777",
];

/** Semantic colours shared by every chart in the app. Same dual-theme rule. */
export const SEMANTIC_COLORS = {
  positive: "#059669",
  warning: "#d97706",
  negative: "#e11d48",
  neutral: "#64748b",
  accent: "#0d9488",
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
 *
 * Shades are per-theme on purpose: the light theme needs the darker end of each
 * hue to clear 4.5:1 on a white card, the dark theme needs the lighter end.
 * `bar` fills sit on `bg-muted`, so they use the 600/400 pair that clears 3:1
 * against that track. All verified by scripts/check-contrast.ts.
 */
export const STAT_ACCENTS = {
  teal: {
    text: "text-teal-800 dark:text-teal-300",
    chip: "bg-teal-500/12 text-teal-800 dark:text-teal-300",
    bar: "bg-teal-600 dark:bg-teal-400",
    rail: "bg-teal-600 dark:bg-teal-400",
  },
  emerald: {
    text: "text-emerald-800 dark:text-emerald-300",
    chip: "bg-emerald-500/12 text-emerald-800 dark:text-emerald-300",
    bar: "bg-emerald-600 dark:bg-emerald-400",
    rail: "bg-emerald-600 dark:bg-emerald-400",
  },
  amber: {
    text: "text-amber-800 dark:text-amber-300",
    chip: "bg-amber-500/12 text-amber-800 dark:text-amber-300",
    bar: "bg-amber-700 dark:bg-amber-400",
    rail: "bg-amber-700 dark:bg-amber-400",
  },
  rose: {
    text: "text-rose-800 dark:text-rose-300",
    chip: "bg-rose-500/12 text-rose-800 dark:text-rose-300",
    bar: "bg-rose-600 dark:bg-rose-400",
    rail: "bg-rose-600 dark:bg-rose-400",
  },
  violet: {
    text: "text-violet-700 dark:text-violet-300",
    chip: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
    bar: "bg-violet-600 dark:bg-violet-400",
    rail: "bg-violet-600 dark:bg-violet-400",
  },
  blue: {
    text: "text-blue-700 dark:text-blue-300",
    chip: "bg-blue-500/12 text-blue-700 dark:text-blue-300",
    bar: "bg-blue-600 dark:bg-blue-400",
    rail: "bg-blue-600 dark:bg-blue-400",
  },
  indigo: {
    text: "text-indigo-700 dark:text-indigo-300",
    chip: "bg-indigo-500/12 text-indigo-700 dark:text-indigo-300",
    bar: "bg-indigo-600 dark:bg-indigo-400",
    rail: "bg-indigo-600 dark:bg-indigo-400",
  },
  slate: {
    text: "text-foreground",
    chip: "bg-muted text-muted-foreground",
    bar: "bg-slate-500 dark:bg-slate-400",
    rail: "bg-slate-500 dark:bg-slate-400",
  },
} as const satisfies Record<string, StatAccent>;

export type StatAccentKey = keyof typeof STAT_ACCENTS;
