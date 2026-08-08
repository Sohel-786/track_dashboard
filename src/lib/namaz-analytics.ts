import {
  NAMAZ_PRAYERS,
  NAMAZ_PRAYER_META,
  type NamazPrayer,
} from "@/lib/namaz";
import { eachDayIso, getTrackingStartDate } from "@/lib/date-ranges";
import {
  getNamazTodayIso,
  hasPrayerWindowEnded,
  isPrayerWindowOpen,
} from "@/lib/prayer-times";
import {
  DEFAULT_NAMAZ_MADHAB,
  type NamazMadhabId,
} from "@/lib/namaz-madhab";
import { format, parseISO, subDays } from "date-fns";

export type StoredNamazLog = {
  date: string;
  prayer: string;
  prayed: boolean;
  sunnah: boolean;
  tasbeeh: boolean;
  zamaat?: boolean;
  isKaza?: boolean;
  prayedAt?: Date | string | null;
  kazaAt?: Date | string | null;
};

export type NamazSlotStatus =
  | "prayed"
  | "kaza"
  | "missed"
  | "pending"
  | "upcoming"
  | "open"
  | "unavailable";

function statusFor(
  date: string,
  prayed: boolean,
  isKaza: boolean,
  today: string,
  trackingStart: string,
  windowEnded: boolean,
  windowOpen: boolean
): NamazSlotStatus {
  if (date < trackingStart) return "unavailable";
  if (prayed && isKaza) return "kaza";
  if (prayed) return "prayed";
  // Window physics (not calendar midnight) decides missed vs open.
  if (windowEnded) return "missed";
  if (windowOpen) return "open";
  if (date === today) return "upcoming";
  if (date > today) return "pending";
  // Past calendar day whose window somehow has not ended (overnight Isha).
  return "pending";
}

function prevIso(date: string) {
  return format(subDays(parseISO(`${date}T00:00:00`), 1), "yyyy-MM-dd");
}

export function buildDayStatus(
  date: string,
  logs: StoredNamazLog[],
  now = new Date(),
  trackingStart = getTrackingStartDate(),
  madhabId: NamazMadhabId = DEFAULT_NAMAZ_MADHAB
) {
  const today = getNamazTodayIso(now);
  const byPrayer = new Map(logs.map((l) => [l.prayer, l]));
  const prayers = NAMAZ_PRAYERS.map((prayer) => {
    const row = byPrayer.get(prayer);
    const prayed = Boolean(row?.prayed);
    const isKaza = Boolean(row?.isKaza);
    const meta = NAMAZ_PRAYER_META[prayer];
    const ended = hasPrayerWindowEnded(prayer, date, now, madhabId);
    const open = isPrayerWindowOpen(prayer, date, now, madhabId);
    const status = statusFor(
      date,
      prayed,
      isKaza,
      today,
      trackingStart,
      ended,
      open
    );
    const completed = status === "prayed" || status === "kaza";
    return {
      prayer,
      label: meta.label,
      arabic: meta.arabic,
      windowHint: meta.windowHint,
      prayed: completed,
      isKaza: status === "kaza",
      sunnah: completed ? Boolean(row?.sunnah) : false,
      tasbeeh: completed ? Boolean(row?.tasbeeh) : false,
      zamaat: completed ? Boolean(row?.zamaat) : false,
      prayedAt:
        completed && row?.prayedAt
          ? new Date(row.prayedAt).toISOString()
          : null,
      kazaAt:
        status === "kaza" && row?.kazaAt
          ? new Date(row.kazaAt).toISOString()
          : status === "kaza" && row?.prayedAt
            ? new Date(row.prayedAt).toISOString()
            : null,
      status,
    };
  });

  return {
    date,
    isToday: date === today,
    isPast: date < today,
    trackingStart,
    beforeTrackingStart: date < trackingStart,
    prayers,
    prayedCount: prayers.filter((p) => p.status === "prayed").length,
    kazaCount: prayers.filter((p) => p.status === "kaza").length,
    missedCount: prayers.filter((p) => p.status === "missed").length,
    pendingCount: prayers.filter(
      (p) =>
        p.status === "pending" ||
        p.status === "upcoming" ||
        p.status === "open"
    ).length,
  };
}

export type KazaMissedItem = {
  date: string;
  dayLabel: string;
  prayer: NamazPrayer;
  label: string;
};

/**
 * Outstanding Kaza queue.
 * A prayer is outstanding only after its on-time window has ended
 * (Isha: next Fajr — not calendar midnight).
 */
export function collectMissed(
  from: string,
  to: string,
  logs: StoredNamazLog[],
  now = new Date(),
  trackingStart = getTrackingStartDate(),
  madhabId: NamazMadhabId = DEFAULT_NAMAZ_MADHAB
): KazaMissedItem[] {
  const today = getNamazTodayIso(now);
  const rangeStart = from < trackingStart ? trackingStart : from;
  const rangeEnd = to > today ? today : to;
  if (rangeStart > rangeEnd) return [];

  const completedSet = new Set(
    logs.filter((l) => l.prayed).map((l) => `${l.date}:${l.prayer}`)
  );

  const missed: KazaMissedItem[] = [];

  for (const date of eachDayIso(rangeStart, rangeEnd)) {
    for (const prayer of NAMAZ_PRAYERS) {
      if (completedSet.has(`${date}:${prayer}`)) continue;
      if (date > today) continue;
      // Past calendar days still wait for window end (overnight Isha until Fajr).
      if (!hasPrayerWindowEnded(prayer, date, now, madhabId)) continue;

      missed.push({
        date,
        dayLabel: format(parseISO(`${date}T00:00:00`), "EEE"),
        prayer,
        label: NAMAZ_PRAYER_META[prayer].label,
      });
    }
  }
  return missed;
}

function dayFullyCompleted(date: string, logs: StoredNamazLog[]) {
  const set = new Set(
    logs.filter((l) => l.date === date && l.prayed).map((l) => l.prayer)
  );
  return NAMAZ_PRAYERS.every((p) => set.has(p));
}

export function buildNamazAnalytics(input: {
  from: string;
  to: string;
  logs: StoredNamazLog[];
  now?: Date;
  trackingStart?: string;
  madhabId?: NamazMadhabId;
  /** When set, all KPIs / daily / extras scope to this prayer only. */
  prayerFilter?: NamazPrayer | null;
}) {
  const now = input.now ?? new Date();
  const today = getNamazTodayIso(now);
  const trackingStart = input.trackingStart ?? getTrackingStartDate();
  const madhabId = input.madhabId ?? DEFAULT_NAMAZ_MADHAB;
  const prayerFilter = input.prayerFilter ?? null;
  const from = input.from < trackingStart ? trackingStart : input.from;
  const to = input.to < trackingStart ? trackingStart : input.to;

  const prayersInScope: NamazPrayer[] = prayerFilter
    ? [prayerFilter]
    : [...NAMAZ_PRAYERS];

  const allMissed = collectMissed(
    from,
    to,
    input.logs,
    now,
    trackingStart,
    madhabId
  );
  const missed = prayerFilter
    ? allMissed.filter((m) => m.prayer === prayerFilter)
    : allMissed;

  const days = eachDayIso(from, to);
  const pastDays = days.filter((d) => d < today && d >= trackingStart);
  const finalizedExpected = pastDays.length * prayersInScope.length;

  const inRange = (date: string) =>
    date >= from && date <= to && date >= trackingStart;

  const matchesPrayer = (prayer: string) =>
    !prayerFilter || prayer === prayerFilter;

  const completedLogs = input.logs.filter(
    (l) => l.prayed && inRange(l.date) && matchesPrayer(l.prayer)
  );
  const prayedOnTime = completedLogs.filter((l) => !l.isKaza);
  const prayedKaza = completedLogs.filter((l) => l.isKaza);

  const sunnahWith = completedLogs.filter((l) => l.sunnah).length;
  const sunnahWithout = completedLogs.filter((l) => !l.sunnah).length;
  const tasbeehWith = completedLogs.filter((l) => l.tasbeeh).length;
  const tasbeehWithout = completedLogs.filter((l) => !l.tasbeeh).length;
  const zamaatWith = completedLogs.filter((l) => l.zamaat).length;
  const zamaatWithout = completedLogs.filter((l) => !l.zamaat).length;

  const byPrayer = NAMAZ_PRAYERS.map((prayer) => {
    const rows = input.logs.filter(
      (l) => l.prayer === prayer && l.prayed && inRange(l.date)
    );
    return {
      prayer,
      label: NAMAZ_PRAYER_META[prayer].label,
      prayed: rows.filter((l) => !l.isKaza).length,
      kaza: rows.filter((l) => l.isKaza).length,
      sunnah: rows.filter((l) => l.sunnah).length,
      sunnahWithout: rows.filter((l) => !l.sunnah).length,
      tasbeeh: rows.filter((l) => l.tasbeeh).length,
      tasbeehWithout: rows.filter((l) => !l.tasbeeh).length,
      zamaat: rows.filter((l) => l.zamaat).length,
      zamaatWithout: rows.filter((l) => !l.zamaat).length,
      missed: allMissed.filter((m) => m.prayer === prayer).length,
    };
  });

  const daily = days.map((date) => {
    const dayLogs = input.logs.filter(
      (l) => l.date === date && matchesPrayer(l.prayer)
    );
    const status = buildDayStatus(
      date,
      input.logs.filter((l) => l.date === date),
      now,
      trackingStart,
      madhabId
    );

    const completed = dayLogs.filter((l) => l.prayed);
    const prayed = completed.filter((l) => !l.isKaza).length;
    const kaza = completed.filter((l) => l.isKaza).length;

    let missedCount: number;
    let pendingCount: number;
    if (prayerFilter) {
      const slot = status.prayers.find((p) => p.prayer === prayerFilter);
      missedCount = slot?.status === "missed" ? 1 : 0;
      pendingCount =
        slot &&
        (slot.status === "pending" ||
          slot.status === "upcoming" ||
          slot.status === "open")
          ? 1
          : 0;
    } else {
      missedCount = status.missedCount;
      pendingCount = status.pendingCount;
    }

    return {
      date,
      dayLabel: format(parseISO(`${date}T00:00:00`), "MMM d"),
      weekday: format(parseISO(`${date}T00:00:00`), "EEE"),
      prayed,
      kaza,
      missed: missedCount,
      pending: pendingCount,
      completed: completed.length,
      sunnahWith: completed.filter((l) => l.sunnah).length,
      sunnahWithout: completed.filter((l) => !l.sunnah).length,
      tasbeehWith: completed.filter((l) => l.tasbeeh).length,
      tasbeehWithout: completed.filter((l) => !l.tasbeeh).length,
      zamaatWith: completed.filter((l) => Boolean(l.zamaat)).length,
      zamaatWithout: completed.filter((l) => !l.zamaat).length,
    };
  });

  const kazaLog = prayedKaza
    .map((l) => ({
      date: l.date,
      dayLabel: format(parseISO(`${l.date}T00:00:00`), "EEE"),
      prayer: l.prayer as NamazPrayer,
      label: NAMAZ_PRAYER_META[l.prayer as NamazPrayer]?.label ?? l.prayer,
      kazaAt: l.kazaAt
        ? new Date(l.kazaAt).toISOString()
        : l.prayedAt
          ? new Date(l.prayedAt).toISOString()
          : null,
      sunnah: Boolean(l.sunnah),
      tasbeeh: Boolean(l.tasbeeh),
      zamaat: Boolean(l.zamaat),
    }))
    .sort(
      (a, b) => b.date.localeCompare(a.date) || a.prayer.localeCompare(b.prayer)
    );

  let streak = 0;
  let cursor = today;
  if (dayFullyCompleted(today, input.logs)) {
    streak = 1;
    cursor = prevIso(today);
  } else {
    cursor = prevIso(today);
  }
  while (
    cursor >= trackingStart &&
    dayFullyCompleted(cursor, input.logs) &&
    streak < 400
  ) {
    streak += 1;
    cursor = prevIso(cursor);
  }

  const completedPast = input.logs.filter(
    (l) =>
      l.prayed &&
      l.date < today &&
      inRange(l.date) &&
      matchesPrayer(l.prayer)
  ).length;

  const completionPct =
    finalizedExpected > 0
      ? Math.round((completedPast / finalizedExpected) * 1000) / 10
      : 0;

  return {
    trackingStart,
    prayerFilter,
    kpis: {
      prayedInRange: prayedOnTime.length,
      kazaInRange: prayedKaza.length,
      completedInRange: completedLogs.length,
      missedInRange: missed.length,
      completionPct,
      streak,
      sunnahInRange: sunnahWith,
      sunnahWithoutInRange: sunnahWithout,
      tasbeehInRange: tasbeehWith,
      tasbeehWithoutInRange: tasbeehWithout,
      zamaatInRange: zamaatWith,
      zamaatWithoutInRange: zamaatWithout,
      finalizedExpected,
    },
    byPrayer,
    daily,
    extrasShare: {
      sunnah: { with: sunnahWith, without: sunnahWithout },
      tasbeeh: { with: tasbeehWith, without: tasbeehWithout },
      zamaat: { with: zamaatWith, without: zamaatWithout },
    },
    missed: missed.slice().reverse(),
    kazaLog,
  };
}
