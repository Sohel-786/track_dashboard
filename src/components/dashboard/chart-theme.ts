export const CHART_TICK = {
  fontSize: 11,
  fill: "hsl(var(--foreground))",
} as const;

export const CHART_GRID_STROKE = "hsl(var(--border))";

export const CHART_TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "8px",
    color: "hsl(var(--foreground))",
    fontSize: "12px",
  },
  labelStyle: { color: "hsl(var(--foreground))", fontWeight: 600 },
  itemStyle: { color: "hsl(var(--foreground))" },
};

export const BAR_PALETTE = [
  "bg-orange-500",
  "bg-violet-500",
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-cyan-500",
  "bg-rose-500",
  "bg-indigo-500",
];

export const SERIES_COLORS = [
  "#0d9488",
  "#8b5cf6",
  "#3b82f6",
  "#f97316",
  "#10b981",
  "#f59e0b",
  "#06b6d4",
  "#ec4899",
];

export const KPI_THEMES = {
  today: {
    gradient: "from-orange-500 via-orange-600 to-amber-700",
    border: "border-orange-300/40",
    shadow: "shadow-lg shadow-orange-500/25",
    iconBg: "bg-white/20 ring-1 ring-white/25",
  },
  week: {
    gradient: "from-sky-500 via-sky-600 to-blue-700",
    border: "border-sky-300/40",
    shadow: "shadow-lg shadow-sky-500/25",
    iconBg: "bg-white/20 ring-1 ring-white/25",
  },
  month: {
    gradient: "from-violet-500 via-violet-600 to-purple-700",
    border: "border-violet-300/40",
    shadow: "shadow-lg shadow-violet-500/25",
    iconBg: "bg-white/20 ring-1 ring-white/25",
  },
  year: {
    gradient: "from-emerald-500 via-emerald-600 to-teal-700",
    border: "border-emerald-300/40",
    shadow: "shadow-lg shadow-emerald-500/25",
    iconBg: "bg-white/20 ring-1 ring-white/25",
  },
  range: {
    gradient: "from-blue-500 via-blue-600 to-indigo-700",
    border: "border-blue-300/40",
    shadow: "shadow-lg shadow-blue-500/25",
    iconBg: "bg-white/20 ring-1 ring-white/25",
  },
  target: {
    gradient: "from-amber-500 via-amber-600 to-orange-700",
    border: "border-amber-300/40",
    shadow: "shadow-lg shadow-amber-500/25",
    iconBg: "bg-white/20 ring-1 ring-white/25",
  },
} as const;
