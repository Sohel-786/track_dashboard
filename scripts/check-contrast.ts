/**
 * WCAG contrast audit for the TrackDash palette. Run: `npm run check:contrast`.
 *
 * This is the spec for every colour decision in the app. Text pairs are held to
 * 4.5:1 (AA for body and the many 10–11px labels this UI uses); chart ink and
 * progress fills to 3:1 (WCAG 1.4.11 non-text contrast); purely structural
 * edges to a lower "must be perceptible" bar.
 *
 * When you change a token in globals.css or an accent in chart-theme.ts, mirror
 * it here and re-run. A failure means the change is not readable in one of the
 * two themes.
 */

type Rgb = { r: number; g: number; b: number };

function hslToRgb(h: number, s: number, l: number): Rgb {
  const S = s / 100;
  const L = l / 100;
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rgb: [number, number, number];
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const m = L - c / 2;
  return {
    r: Math.round((rgb[0] + m) * 255),
    g: Math.round((rgb[1] + m) * 255),
    b: Math.round((rgb[2] + m) * 255),
  };
}

/** `"210 40% 96.1%"` (the CSS-variable form used in globals.css) → rgb. */
function tokenToRgb(token: string): Rgb {
  const [h, s, l] = token.trim().split(/\s+/);
  return hslToRgb(parseFloat(h), parseFloat(s), parseFloat(l));
}

function hexToRgb(hex: string): Rgb {
  const v = hex.replace("#", "");
  const full =
    v.length === 3
      ? v
          .split("")
          .map((c) => c + c)
          .join("")
      : v;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function toHex({ r, g, b }: Rgb) {
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

/** Composite a translucent foreground over an opaque backdrop. */
function over(fg: Rgb, bg: Rgb, alpha: number): Rgb {
  return {
    r: Math.round(fg.r * alpha + bg.r * (1 - alpha)),
    g: Math.round(fg.g * alpha + bg.g * (1 - alpha)),
    b: Math.round(fg.b * alpha + bg.b * (1 - alpha)),
  };
}

function luminance({ r, g, b }: Rgb) {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function ratio(a: Rgb, b: Rgb) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/* ------------------------------------------------------ palette under test */

const LIGHT = {
  background: tokenToRgb("214 32% 94%"),
  card: tokenToRgb("0 0% 100%"),
  foreground: tokenToRgb("222 47% 11%"),
  mutedForeground: tokenToRgb("215 25% 35%"),
  muted: tokenToRgb("214 32% 91%"),
  border: tokenToRgb("214 25% 84%"),
  primary: tokenToRgb("173 80% 26%"),
  primaryForeground: tokenToRgb("0 0% 100%"),
  destructive: tokenToRgb("0 72% 42%"),
};

const DARK = {
  background: tokenToRgb("222 47% 6%"),
  card: tokenToRgb("222 38% 14%"),
  foreground: tokenToRgb("210 40% 98%"),
  mutedForeground: tokenToRgb("215 22% 72%"),
  muted: tokenToRgb("217 30% 22%"),
  border: tokenToRgb("217 27% 28%"),
  primary: tokenToRgb("173 68% 28%"),
  primaryForeground: tokenToRgb("0 0% 100%"),
  destructive: tokenToRgb("0 63% 45%"),
};

/** Tailwind shades this UI actually uses for tinted chips and accents. */
const T: Record<string, string> = {
  "teal-500": "#14b8a6",
  "teal-700": "#0f766e",
  "teal-800": "#115e59",
  "teal-300": "#5eead4",
  "emerald-500": "#22c55e",
  "emerald-700": "#047857",
  "emerald-800": "#065f46",
  "emerald-300": "#6ee7b7",
  "amber-500": "#f59e0b",
  "amber-700": "#b45309",
  "amber-800": "#92400e",
  "amber-900": "#78350f",
  "amber-300": "#fcd34d",
  "rose-500": "#f43f5e",
  "rose-700": "#be123c",
  "rose-800": "#9f1239",
  "rose-300": "#fda4af",
  "violet-500": "#8b5cf6",
  "violet-700": "#6d28d9",
  "violet-300": "#c4b5fd",
  "blue-500": "#3b82f6",
  "blue-700": "#1d4ed8",
  "blue-300": "#93c5fd",
  "indigo-500": "#6366f1",
  "indigo-700": "#4338ca",
  "indigo-300": "#a5b4fc",
  "sky-500": "#0ea5e9",
  "sky-800": "#075985",
  "orange-500": "#f97316",
  "orange-900": "#7c2d12",
};

type Row = {
  label: string;
  fg: Rgb;
  bg: Rgb;
  min: number;
};

const rows: Row[] = [];

function text(label: string, fg: Rgb, bg: Rgb) {
  rows.push({ label, fg, bg, min: 4.5 });
}
/** Meaningful graphics — chart ink, progress fills. WCAG 1.4.11 wants 3:1. */
function surface(label: string, fg: Rgb, bg: Rgb) {
  rows.push({ label, fg, bg, min: 3 });
}
/**
 * Purely structural edges (card vs page, empty track vs card). These carry no
 * information on their own — the border, shadow and the filled portion do — so
 * they only need to be perceptible, not to clear 3:1.
 */
function edge(label: string, fg: Rgb, bg: Rgb, min = 1.15) {
  rows.push({ label, fg, bg, min });
}

for (const [mode, P] of [
  ["light", LIGHT],
  ["dark", DARK],
] as const) {
  const card = P.card;

  text(`${mode}: body text on card`, P.foreground, card);
  text(`${mode}: body text on page`, P.foreground, P.background);
  text(`${mode}: muted label on card`, P.mutedForeground, card);
  text(`${mode}: muted label on page`, P.mutedForeground, P.background);
  text(`${mode}: muted label on muted chip`, P.mutedForeground, P.muted);
  text(`${mode}: primary button text`, P.primaryForeground, P.primary);
  text(`${mode}: destructive button text`, P.primaryForeground, P.destructive);

  edge(`${mode}: card vs page surface`, card, P.background);
  edge(`${mode}: border vs card`, P.border, card, 1.35);
  edge(`${mode}: empty track vs card`, P.muted, card);
  // What actually conveys the value: the filled portion against its track.
  surface(
    `${mode}: progress fill vs track`,
    hexToRgb(mode === "light" ? "#0d9488" : "#2dd4bf"),
    P.muted
  );
  surface(
    `${mode}: success fill vs track`,
    hexToRgb(mode === "light" ? "#059669" : "#34d399"),
    P.muted
  );

  // Tinted status chips: `bg-<hue>-500/15` composited over the card.
  const chip = (hue: string, shade: string, alpha = 0.15) =>
    text(
      `${mode}: ${hue} chip text (${shade})`,
      hexToRgb(T[shade]),
      over(hexToRgb(T[`${hue}-500`]), card, alpha)
    );

  if (mode === "light") {
    chip("teal", "teal-800");
    chip("emerald", "emerald-800");
    chip("amber", "amber-800");
    chip("rose", "rose-800");
    chip("violet", "violet-700");
    chip("blue", "blue-700");
    chip("indigo", "indigo-700");
    chip("sky", "sky-800");
    chip("orange", "orange-900");
    // Stat-tile accents sit on a lighter /12 tint.
    chip("teal", "teal-700", 0.12);
    chip("amber", "amber-800", 0.12);
    chip("rose", "rose-800", 0.12);
    chip("emerald", "emerald-800", 0.12);
    chip("violet", "violet-700", 0.12);
    chip("blue", "blue-700", 0.12);
    chip("indigo", "indigo-700", 0.12);
  } else {
    chip("teal", "teal-300");
    chip("emerald", "emerald-300");
    chip("amber", "amber-300");
    chip("rose", "rose-300");
    chip("violet", "violet-300");
    chip("blue", "blue-300");
    chip("indigo", "indigo-300");
  }
}

/* --------------------------------------------- chart ink on both surfaces */

const CHART = {
  positive: "#059669",
  warning: "#d97706",
  negative: "#e11d48",
  neutral: "#64748b",
  accent: "#0d9488",
  info: "#6366f1",
  violet: "#8b5cf6",
  cyan: "#0891b2",
  orange: "#ea580c",
  pink: "#db2777",
  seriesBlue: "#3b82f6",
};

for (const [name, hex] of Object.entries(CHART)) {
  surface(`light: chart ${name} on card`, hexToRgb(hex), LIGHT.card);
  surface(`dark: chart ${name} on card`, hexToRgb(hex), DARK.card);
}

/* ------------------------------------ solid buttons: white label on a fill */

const SOLID_BUTTONS: Record<string, string> = {
  "amber (Mark Kaza)": "#b45309",
  "emerald (prayed on time)": "#047857",
  "teal (primaryButtonClass)": "#0f766e",
  "rose (destructive)": "#b91c1c",
};

for (const [name, hex] of Object.entries(SOLID_BUTTONS)) {
  text(`both: white label on ${name}`, hexToRgb("#ffffff"), hexToRgb(hex));
}

// Dark mode flips the amber button to a bright fill with near-black text.
text(
  "dark: amber-950 label on amber-400 button",
  hexToRgb("#451a03"),
  hexToRgb("#fbbf24")
);
text(
  "dark: amber-950 label on amber-300 hover",
  hexToRgb("#451a03"),
  hexToRgb("#fcd34d")
);

/* ------------------------------- progress fills against the `bg-muted` track */

const FILLS: Record<string, [string, string]> = {
  // [light shade, dark shade]
  teal: ["#0d9488", "#2dd4bf"],
  emerald: ["#059669", "#34d399"],
  amber: ["#b45309", "#fbbf24"],
  rose: ["#e11d48", "#fb7185"],
  violet: ["#7c3aed", "#a78bfa"],
  blue: ["#2563eb", "#60a5fa"],
  indigo: ["#4f46e5", "#818cf8"],
  slate: ["#64748b", "#94a3b8"],
};

for (const [name, [lightHex, darkHex]] of Object.entries(FILLS)) {
  surface(`light: ${name} fill vs track`, hexToRgb(lightHex), LIGHT.muted);
  surface(`dark: ${name} fill vs track`, hexToRgb(darkHex), DARK.muted);
}

/* ----------------------------- accent text sitting directly on a plain card */

const ACCENT_TEXT: Record<string, [string, string]> = {
  teal: ["#115e59", "#5eead4"],
  emerald: ["#065f46", "#6ee7b7"],
  amber: ["#92400e", "#fcd34d"],
  rose: ["#9f1239", "#fda4af"],
  violet: ["#6d28d9", "#c4b5fd"],
  blue: ["#1d4ed8", "#93c5fd"],
  indigo: ["#4338ca", "#a5b4fc"],
  orange: ["#9a3412", "#fdba74"],
};

for (const [name, [lightHex, darkHex]] of Object.entries(ACCENT_TEXT)) {
  text(`light: ${name} accent text on card`, hexToRgb(lightHex), LIGHT.card);
  text(`dark: ${name} accent text on card`, hexToRgb(darkHex), DARK.card);
}

/* ------------------------------------------------------------------ report */

let failures = 0;
const pad = (s: string, n: number) => s.padEnd(n);

console.log(
  `\n${pad("PAIR", 44)} ${pad("RATIO", 8)} ${pad("MIN", 6)} RESULT   COLOURS`
);
console.log("-".repeat(100));

for (const row of rows) {
  const r = ratio(row.fg, row.bg);
  const ok = r >= row.min;
  if (!ok) failures += 1;
  console.log(
    `${pad(row.label, 44)} ${pad(String(r), 8)} ${pad(String(row.min), 6)} ` +
      `${ok ? "pass  " : "FAIL  "}   ${toHex(row.fg)} on ${toHex(row.bg)}`
  );
}

console.log(
  `\n${failures === 0 ? "ALL PAIRS PASS" : `${failures} PAIR(S) BELOW TARGET`}\n`
);
process.exit(failures === 0 ? 0 : 1);
