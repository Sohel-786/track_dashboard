import {
  CalculationMethod,
  Coordinates,
  PrayerTimes,
} from "adhan";
import { NAMAZ_PRAYERS, NAMAZ_PRAYER_META, type NamazPrayer } from "@/lib/namaz";
import {
  DEFAULT_NAMAZ_MADHAB,
  adhanMadhabFor,
  getNamazMadhab,
  type NamazMadhabId,
} from "@/lib/namaz-madhab";

/** Fixed production location for TrackDash Namaz (India · Ahmedabad). */
export const NAMAZ_LOCATION_BASE = {
  city: "Ahmedabad",
  region: "Gujarat",
  country: "India",
  latitude: 23.0225,
  longitude: 72.5714,
  timeZone: "Asia/Kolkata",
  /** University of Islamic Sciences, Karachi — widely used across South Asia. */
  method: "Karachi",
  library: "adhan@4.4.4",
  libraryUrl: "https://github.com/batoulapps/adhan-js",
} as const;

/** @deprecated Prefer locationWithMadhab(); kept for callers that need city/coords only. */
export const NAMAZ_LOCATION = {
  ...NAMAZ_LOCATION_BASE,
  madhab: "Hanafi",
} as const;

export type NamazLocationSnapshot = typeof NAMAZ_LOCATION_BASE & {
  madhab: string;
  madhabId: NamazMadhabId;
};

export function locationWithMadhab(
  madhabId: NamazMadhabId = DEFAULT_NAMAZ_MADHAB
): NamazLocationSnapshot {
  const school = getNamazMadhab(madhabId);
  return {
    ...NAMAZ_LOCATION_BASE,
    madhab: school.label,
    madhabId: school.id,
  };
}

export type PrayerWindowPhase = "upcoming" | "open" | "ended";

export type PrayerScheduleSlot = {
  prayer: NamazPrayer;
  label: string;
  arabic: string;
  startsAt: string;
  endsAt: string;
  startsAtLabel: string;
  endsAtLabel: string;
  phase: PrayerWindowPhase;
  /** On-time checklist may be used only while phase === "open". */
  canMarkOnTime: boolean;
  /** Kaza is allowed only after the window has ended. */
  canMarkKaza: boolean;
};

export type NamazScheduleSnapshot = {
  location: NamazLocationSnapshot;
  /** Authoritative clock from the application server (not the user's device). */
  serverNow: string;
  today: string;
  schedule: PrayerScheduleSlot[];
};

function partsInTimeZone(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const bag: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== "literal") bag[p.type] = p.value;
  }
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour: Number(bag.hour),
    minute: Number(bag.minute),
    second: Number(bag.second),
  };
}

/** Calendar YYYY-MM-DD in Ahmedabad (IST) — never from the client device. */
export function getNamazTodayIso(now = new Date()): string {
  const { year, month, day } = partsInTimeZone(now, NAMAZ_LOCATION_BASE.timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function formatInNamazTz(
  value: Date,
  options: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }
): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: NAMAZ_LOCATION_BASE.timeZone,
    ...options,
  }).format(value);
}

/**
 * Build a Date whose local Y/M/D (as seen by adhan on UTC hosts) match the
 * Ahmedabad calendar day. Uses UTC noon to avoid DST edge flips.
 */
function adhanDateForIsoDay(isoDay: string): Date {
  const [y, m, d] = isoDay.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

function calculationParams(madhabId: NamazMadhabId = DEFAULT_NAMAZ_MADHAB) {
  const params = CalculationMethod.Karachi();
  params.madhab = adhanMadhabFor(madhabId);
  return params;
}

function coordinates() {
  return new Coordinates(
    NAMAZ_LOCATION_BASE.latitude,
    NAMAZ_LOCATION_BASE.longitude
  );
}

type RawWindows = Record<
  NamazPrayer,
  { start: Date; end: Date }
>;

export function computePrayerWindows(
  isoDay: string,
  now = new Date(),
  madhabId: NamazMadhabId = DEFAULT_NAMAZ_MADHAB
): RawWindows {
  const coords = coordinates();
  const params = calculationParams(madhabId);
  const dayDate = adhanDateForIsoDay(isoDay);
  const times = new PrayerTimes(coords, dayDate, params);

  const nextIso = (() => {
    const [y, m, d] = isoDay.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1, 12, 0, 0));
    const yy = next.getUTCFullYear();
    const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(next.getUTCDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  })();
  const nextTimes = new PrayerTimes(
    coords,
    adhanDateForIsoDay(nextIso),
    params
  );

  void now;

  return {
    fajar: { start: times.fajr, end: times.sunrise },
    zohar: { start: times.dhuhr, end: times.asr },
    asar: { start: times.asr, end: times.maghrib },
    magrib: { start: times.maghrib, end: times.isha },
    /** Isha lasts until next day's Fajr. */
    isha: { start: times.isha, end: nextTimes.fajr },
  };
}

function phaseFor(
  now: Date,
  start: Date,
  end: Date
): PrayerWindowPhase {
  if (now.getTime() < start.getTime()) return "upcoming";
  if (now.getTime() > end.getTime()) return "ended";
  return "open";
}

export function getNamazScheduleSnapshot(
  now = new Date(),
  madhabId: NamazMadhabId = DEFAULT_NAMAZ_MADHAB
): NamazScheduleSnapshot {
  const today = getNamazTodayIso(now);
  const windows = computePrayerWindows(today, now, madhabId);

  const schedule: PrayerScheduleSlot[] = NAMAZ_PRAYERS.map((prayer) => {
    const { start, end } = windows[prayer];
    const phase = phaseFor(now, start, end);
    const meta = NAMAZ_PRAYER_META[prayer];
    return {
      prayer,
      label: meta.label,
      arabic: meta.arabic,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      startsAtLabel: formatInNamazTz(start),
      endsAtLabel: formatInNamazTz(end),
      phase,
      canMarkOnTime: phase === "open",
      canMarkKaza: phase === "ended",
    };
  });

  return {
    location: locationWithMadhab(madhabId),
    serverNow: now.toISOString(),
    today,
    schedule,
  };
}

export function getPrayerWindow(
  prayer: NamazPrayer,
  isoDay: string,
  now = new Date(),
  madhabId: NamazMadhabId = DEFAULT_NAMAZ_MADHAB
) {
  const windows = computePrayerWindows(isoDay, now, madhabId);
  const slot = windows[prayer];
  const phase = phaseFor(now, slot.start, slot.end);
  return { ...slot, phase };
}

/** True when the prayer's end time has passed (eligible for Kaza if not completed). */
export function hasPrayerWindowEnded(
  prayer: NamazPrayer,
  isoDay: string,
  now = new Date(),
  madhabId: NamazMadhabId = DEFAULT_NAMAZ_MADHAB
): boolean {
  return getPrayerWindow(prayer, isoDay, now, madhabId).phase === "ended";
}

export function isPrayerWindowOpen(
  prayer: NamazPrayer,
  isoDay: string,
  now = new Date(),
  madhabId: NamazMadhabId = DEFAULT_NAMAZ_MADHAB
): boolean {
  return getPrayerWindow(prayer, isoDay, now, madhabId).phase === "open";
}
