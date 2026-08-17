export type UserRole = "admin" | "user";

export type AuthUser = {
  id: string;
  username: string;
  name: string;
  role: UserRole;
};

export type Category = {
  id: string;
  name: string;
  /** Daily target for this category. */
  target: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type Entry = {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryTarget: number;
  value: number;
  date: string;
  note: string;
  /** Sum of all entries for this category on this date. */
  dayTotal: number;
  dayRemaining: number;
  dayProgress: number;
  dayHitTarget: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type DaySummary = {
  categoryId: string;
  name: string;
  target: number;
  dayTotal: number;
  remaining: number;
  progress: number;
  hitTarget: boolean;
  entryCount: number;
};

export type EntriesResponse = {
  date: string;
  entries: Entry[];
  daySummaries: DaySummary[];
};

export type TrendPoint = {
  period: string;
  periodStart: string;
  value: number;
  target?: number;
};

export type CategoryProgress = {
  categoryId: string;
  name: string;
  target: number;
  total: number;
  avgDaily: number;
  daysHitPct: number;
  daysHit: number;
  daysTracked: number;
  progress: number;
  entryCount: number;
};

export type DayTargetHit = {
  date: string;
  dayLabel: string;
  weekday: string;
  hits: number;
  total: number;
  pct: number;
  value: number;
  entryCount: number;
};

export type AnalyticsResponse = {
  appliedRange: {
    quick: string;
    from: string;
    to: string;
  };
  /** Equally long window immediately before the applied range. */
  previousRange: { from: string; to: string };
  kpis: {
    todayTotal: number;
    weekTotal: number;
    monthTotal: number;
    yearTotal: number;
    rangeTotal: number;
    entryCount: number;
    activeCategories: number;
    categoriesHitTarget: number;
    dayTargetsHit: number;
    dayTargetsPossible: number;
    /** Days on which every category met its daily target. */
    perfectDays: number;
    activeDays: number;
    rangeDays: number;
  };
  /** Percentage change vs `previousRange`. */
  deltas: {
    rangeTotal: number;
    dayTargetsHit: number;
    entryCount: number;
  };
  byCategory: CategoryProgress[];
  trends: {
    day: TrendPoint[];
    week: TrendPoint[];
    month: TrendPoint[];
  };
  dailyTargetHits: DayTargetHit[];
  progressiveByCategory: {
    categoryId: string;
    name: string;
    target: number;
    series: TrendPoint[];
  }[];
};

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  message?: string;
};

export type NamazPrayerKey =
  | "fajar"
  | "zohar"
  | "asar"
  | "magrib"
  | "isha";

export type NamazPrayerStatus =
  | "prayed"
  | "kaza"
  /** Window ended and the day is over — only Kaza can clear it. */
  | "missed"
  /** Window ended but it is still that prayer's own day — on time or Kaza. */
  | "grace"
  | "pending"
  | "upcoming"
  | "open"
  | "unavailable";

export type NamazPrayerDay = {
  prayer: NamazPrayerKey;
  label: string;
  arabic: string;
  windowHint: string;
  prayed: boolean;
  isKaza: boolean;
  sunnah: boolean;
  tasbeeh: boolean;
  zamaat: boolean;
  prayedAt: string | null;
  kazaAt: string | null;
  status: NamazPrayerStatus;
  /**
   * Calendar day this prayer log belongs to. Differs from checklist `day.date`
   * for overnight Isha carryover (yesterday until Fajr).
   */
  logDate?: string;
  /** True when this row is yesterday's Isha still open after midnight. */
  isOvernightCarryover?: boolean;
  /** Window metadata for this exact row, resolved server-side. */
  slot?: NamazPrayerScheduleSlot | null;
};

export type NamazPrayerScheduleSlot = {
  prayer: NamazPrayerKey;
  label: string;
  arabic: string;
  date: string;
  startsAt: string;
  endsAt: string;
  startsAtLabel: string;
  endsAtLabel: string;
  phase: "upcoming" | "open" | "ended";
  /** Window is currently running. */
  canMarkOnTime: boolean;
  /** Window closed, but the same-day grace still allows an on-time entry. */
  canMarkOnTimeLate: boolean;
  canMarkKaza: boolean;
  graceEndsAt: string | null;
  graceEndsAtLabel: string | null;
};

export type NamazOvernightIsha = {
  date: string;
  slot: NamazPrayerScheduleSlot;
};

export type NamazScheduleSnapshot = {
  location: {
    city: string;
    region: string;
    country: string;
    latitude: number;
    longitude: number;
    timeZone: string;
    method: string;
    madhab: string;
    madhabId: "hanafi" | "shafi" | "maliki" | "hanbali";
    library: string;
    libraryUrl: string;
  };
  serverNow: string;
  today: string;
  /** Next IST midnight — when today's late on-time grace closes. */
  dayEndsAt: string;
  schedule: NamazPrayerScheduleSlot[];
  /** Yesterday's Isha still open until Fajr; null when N/A. */
  overnightIsha: NamazOvernightIsha | null;
};

export type NamazDayStatus = {
  date: string;
  isToday: boolean;
  isPast: boolean;
  trackingStart?: string;
  beforeTrackingStart?: boolean;
  madhabId?: "hanafi" | "shafi" | "maliki" | "hanbali";
  prayers: NamazPrayerDay[];
  prayedCount: number;
  kazaCount: number;
  missedCount: number;
  /** Windows closed today that can still be recorded before midnight. */
  graceCount: number;
  pendingCount: number;
  schedule?: NamazScheduleSnapshot;
};

export type NamazMissedItem = {
  date: string;
  dayLabel: string;
  weekday: string;
  prayer: NamazPrayerKey;
  label: string;
  arabic: string;
  daysAgo: number;
  inGrace: boolean;
};

export type NamazKazaRecentItem = {
  date: string;
  prayer: NamazPrayerKey;
  label: string;
  kazaAt: string | null;
  sunnah: boolean;
  tasbeeh: boolean;
  zamaat: boolean;
};

export type NamazKazaStats = {
  pending: number;
  days: number;
  oldestDate: string | null;
  oldestDaysAgo: number;
  byPrayer: Array<{ prayer: NamazPrayerKey; label: string; count: number }>;
};

export type NamazKazaQueueResponse = {
  trackingStart: string;
  madhabId?: "hanafi" | "shafi" | "maliki" | "hanbali";
  schedule?: NamazScheduleSnapshot;
  /** Past days only — today's closed windows arrive in `graceToday`. */
  outstanding: NamazMissedItem[];
  count: number;
  graceToday: NamazMissedItem[];
  recent: NamazKazaRecentItem[];
  stats: NamazKazaStats;
  /** Bulk write results. */
  completed?: number;
  skipped?: number;
  errors?: string[];
  undone?: { date: string; prayer: NamazPrayerKey };
};

export type NamazAnalyticsResponse = {
  appliedRange: {
    quick: string;
    from: string;
    to: string;
  };
  trackingStart?: string;
  prayerFilter?: NamazPrayerKey | null;
  kpis: {
    prayedInRange: number;
    kazaInRange: number;
    completedInRange: number;
    missedInRange: number;
    graceTodayCount: number;
    completionPct: number;
    onTimePct: number;
    streak: number;
    bestStreak: number;
    sunnahInRange: number;
    sunnahWithoutInRange: number;
    tasbeehInRange: number;
    tasbeehWithoutInRange: number;
    zamaatInRange: number;
    zamaatWithoutInRange: number;
    finalizedExpected: number;
  };
  byPrayer: Array<{
    prayer: NamazPrayerKey;
    label: string;
    prayed: number;
    kaza: number;
    expected: number;
    onTimePct: number;
    completedPct: number;
    sunnah: number;
    sunnahWithout: number;
    tasbeeh: number;
    tasbeehWithout: number;
    zamaat: number;
    zamaatWithout: number;
    missed: number;
  }>;
  daily: Array<{
    date: string;
    dayLabel: string;
    weekday: string;
    prayed: number;
    kaza: number;
    missed: number;
    grace: number;
    pending: number;
    completed: number;
    slots: number;
    isFinalized: boolean;
    onTimePct: number;
    completedPct: number;
    sunnahWith: number;
    sunnahWithout: number;
    tasbeehWith: number;
    tasbeehWithout: number;
    zamaatWith: number;
    zamaatWithout: number;
  }>;
  graceToday: NamazMissedItem[];
  extrasShare: {
    sunnah: { with: number; without: number };
    tasbeeh: { with: number; without: number };
    zamaat: { with: number; without: number };
  };
  missed: NamazMissedItem[];
  kazaLog: Array<{
    date: string;
    dayLabel: string;
    prayer: NamazPrayerKey;
    label: string;
    kazaAt: string | null;
    sunnah: boolean;
    tasbeeh: boolean;
    zamaat: boolean;
  }>;
};
