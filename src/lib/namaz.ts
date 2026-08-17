/** Canonical prayer keys used in DB + API. */
export const NAMAZ_PRAYERS = [
  "fajar",
  "zohar",
  "asar",
  "magrib",
  "isha",
] as const;

export type NamazPrayer = (typeof NAMAZ_PRAYERS)[number];

export type NamazPrayerMeta = {
  key: NamazPrayer;
  label: string;
  arabic: string;
  /** Approximate window hint for UI (not used for miss logic). */
  windowHint: string;
  accent: string;
  accentSoft: string;
};

export const NAMAZ_PRAYER_META: Record<NamazPrayer, NamazPrayerMeta> = {
  fajar: {
    key: "fajar",
    label: "Fajar",
    arabic: "الفجر",
    windowHint: "Dawn",
    accent: "from-sky-600 to-indigo-700",
    accentSoft:
      "bg-sky-500/15 text-sky-900 dark:bg-sky-400/15 dark:text-sky-200",
  },
  zohar: {
    key: "zohar",
    label: "Zohar",
    arabic: "الظهر",
    windowHint: "Midday",
    accent: "from-amber-500 to-orange-600",
    accentSoft:
      "bg-amber-500/15 text-amber-900 dark:bg-amber-400/15 dark:text-amber-200",
  },
  asar: {
    key: "asar",
    label: "Asar",
    arabic: "العصر",
    windowHint: "Afternoon",
    accent: "from-orange-500 to-rose-600",
    accentSoft:
      "bg-orange-500/15 text-orange-900 dark:bg-orange-400/15 dark:text-orange-200",
  },
  magrib: {
    key: "magrib",
    label: "Magrib",
    arabic: "المغرب",
    windowHint: "Sunset",
    accent: "from-rose-500 to-fuchsia-700",
    accentSoft:
      "bg-rose-500/15 text-rose-900 dark:bg-rose-400/15 dark:text-rose-200",
  },
  isha: {
    key: "isha",
    label: "Isha",
    arabic: "العشاء",
    windowHint: "Night",
    accent: "from-indigo-600 to-slate-800",
    accentSoft:
      "bg-indigo-500/15 text-indigo-900 dark:bg-indigo-400/15 dark:text-indigo-200",
  },
};

export function isNamazPrayer(value: string): value is NamazPrayer {
  return (NAMAZ_PRAYERS as readonly string[]).includes(value);
}
