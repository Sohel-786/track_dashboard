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
  /** Calendar day (YYYY-MM-DD) this window belongs to. */
  date: string;
  startsAt: string;
  endsAt: string;
  startsAtLabel: string;
  endsAtLabel: string;
  phase: PrayerWindowPhase;
  /** True while the window itself is still running. */
  canMarkOnTime: boolean;
  /**
   * Window has ended but the prayer's own calendar day is still today, so an
   * on-time entry may still be recorded (user prayed in time, forgot to tick).
   * Expires at the next IST midnight.
   */
  canMarkOnTimeLate: boolean;
  /** Kaza is allowed only after the window has ended. */
  canMarkKaza: boolean;
  /** Instant the late on-time grace closes (next IST midnight); null when N/A. */
  graceEndsAt: string | null;
  graceEndsAtLabel: string | null;
};

/**
 * After midnight until Fajr, yesterday's Isha window is still open for on-time
 * marking. Surfaced separately so today's timetable can keep tonight's Isha.
 */
export type OvernightIshaCarryover = {
  /** Calendar day the Isha belongs to (yesterday). */
  date: string;
  slot: PrayerScheduleSlot;
};

export type NamazScheduleSnapshot = {
  location: NamazLocationSnapshot;
  /** Authoritative clock from the application server (not the user's device). */
  serverNow: string;
  today: string;
  /** Next IST midnight — when today's late on-time grace closes. */
  dayEndsAt: string;
  schedule: PrayerScheduleSlot[];
  /**
   * Present only between IST midnight and Fajr when yesterday's Isha has not
   * yet ended. Null when N/A.
   */
  overnightIsha: OvernightIshaCarryover | null;
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

/** Shift a YYYY-MM-DD calendar day by `deltaDays` (UTC noon anchor). */
export function shiftIsoDay(isoDay: string, deltaDays: number): string {
  const [y, m, d] = isoDay.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + deltaDays, 12, 0, 0));
  const yy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(next.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Calendar YYYY-MM-DD in Ahmedabad (IST) — never from the client device. */
export function getNamazTodayIso(now = new Date()): string {
  const { year, month, day } = partsInTimeZone(now, NAMAZ_LOCATION_BASE.timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Previous Ahmedabad calendar day relative to `now`. */
export function getNamazYesterdayIso(now = new Date()): string {
  return shiftIsoDay(getNamazTodayIso(now), -1);
}

/**
 * Instant at which `isoDay` ends in Ahmedabad (next IST midnight).
 * Asia/Kolkata is a fixed UTC+05:30 offset with no DST, so 18:30 UTC of the
 * same date is exactly midnight at the start of the following IST day.
 */
export function endOfNamazDay(isoDay: string): Date {
  const [y, m, d] = isoDay.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 18, 30, 0));
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

  const nextIso = shiftIsoDay(isoDay, 1);
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

function slotFromWindow(
  prayer: NamazPrayer,
  isoDay: string,
  start: Date,
  end: Date,
  now: Date
): PrayerScheduleSlot {
  const phase = phaseFor(now, start, end);
  const meta = NAMAZ_PRAYER_META[prayer];
  const isToday = isoDay === getNamazTodayIso(now);
  const graceEnds = isToday ? endOfNamazDay(isoDay) : null;
  return {
    prayer,
    label: meta.label,
    arabic: meta.arabic,
    date: isoDay,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    startsAtLabel: formatInNamazTz(start),
    endsAtLabel: formatInNamazTz(end),
    phase,
    canMarkOnTime: phase === "open",
    canMarkOnTimeLate: phase === "ended" && isToday,
    canMarkKaza: phase === "ended",
    graceEndsAt: graceEnds ? graceEnds.toISOString() : null,
    graceEndsAtLabel: graceEnds ? formatInNamazTz(graceEnds) : null,
  };
}

/**
 * Yesterday's Isha after IST midnight, while its window is still open until
 * today's Fajr. Returns null once Fajr starts or if today's Isha is already open.
 */
export function getOvernightIshaCarryover(
  now = new Date(),
  madhabId: NamazMadhabId = DEFAULT_NAMAZ_MADHAB
): OvernightIshaCarryover | null {
  const today = getNamazTodayIso(now);
  const yesterday = getNamazYesterdayIso(now);

  // Tonight's Isha already started — overnight carryover no longer applies.
  if (isPrayerWindowOpen("isha", today, now, madhabId)) return null;

  const window = getPrayerWindow("isha", yesterday, now, madhabId);
  if (window.phase !== "open") return null;

  return {
    date: yesterday,
    slot: slotFromWindow("isha", yesterday, window.start, window.end, now),
  };
}

/**
 * Calendar date that currently owns an open on-time window for `prayer`.
 * For Isha after midnight this is yesterday until Fajr.
 */
export function resolveOpenOnTimeDate(
  prayer: NamazPrayer,
  now = new Date(),
  madhabId: NamazMadhabId = DEFAULT_NAMAZ_MADHAB
): string | null {
  const today = getNamazTodayIso(now);
  if (isPrayerWindowOpen(prayer, today, now, madhabId)) return today;

  if (prayer === "isha") {
    const overnight = getOvernightIshaCarryover(now, madhabId);
    if (overnight) return overnight.date;
  }

  return null;
}

/**
 * May this prayer still be recorded as **prayed on time**?
 *
 * True while the window runs, and — as a grace period — for the rest of the
 * prayer's own calendar day after the window ends, so a prayer that really was
 * offered in time can still be ticked if the user forgot in the moment.
 * Once the IST day rolls over the entry can only be completed as Kaza.
 */
export function canMarkOnTimeNow(
  prayer: NamazPrayer,
  isoDay: string,
  now = new Date(),
  madhabId: NamazMadhabId = DEFAULT_NAMAZ_MADHAB
): boolean {
  const { phase } = getPrayerWindow(prayer, isoDay, now, madhabId);
  if (phase === "open") return true;
  return phase === "ended" && isoDay === getNamazTodayIso(now);
}

/** True when the window ended but the same-day on-time grace is still running. */
export function isInOnTimeGrace(
  prayer: NamazPrayer,
  isoDay: string,
  now = new Date(),
  madhabId: NamazMadhabId = DEFAULT_NAMAZ_MADHAB
): boolean {
  return (
    isoDay === getNamazTodayIso(now) &&
    hasPrayerWindowEnded(prayer, isoDay, now, madhabId)
  );
}

export function getNamazScheduleSnapshot(
  now = new Date(),
  madhabId: NamazMadhabId = DEFAULT_NAMAZ_MADHAB
): NamazScheduleSnapshot {
  const today = getNamazTodayIso(now);
  const windows = computePrayerWindows(today, now, madhabId);

  const schedule: PrayerScheduleSlot[] = NAMAZ_PRAYERS.map((prayer) => {
    const { start, end } = windows[prayer];
    return slotFromWindow(prayer, today, start, end, now);
  });

  return {
    location: locationWithMadhab(madhabId),
    serverNow: now.toISOString(),
    today,
    /** Grace for today's already-ended windows closes at this instant. */
    dayEndsAt: endOfNamazDay(today).toISOString(),
    schedule,
    overnightIsha: getOvernightIshaCarryover(now, madhabId),
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
