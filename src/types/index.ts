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

export type AnalyticsResponse = {
  appliedRange: {
    quick: string;
    from: string;
    to: string;
  };
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
  };
  byCategory: CategoryProgress[];
  trends: {
    day: TrendPoint[];
    week: TrendPoint[];
    month: TrendPoint[];
  };
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
  | "missed"
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
};

export type NamazPrayerScheduleSlot = {
  prayer: NamazPrayerKey;
  label: string;
  arabic: string;
  startsAt: string;
  endsAt: string;
  startsAtLabel: string;
  endsAtLabel: string;
  phase: "upcoming" | "open" | "ended";
  canMarkOnTime: boolean;
  canMarkKaza: boolean;
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
  pendingCount: number;
  schedule?: NamazScheduleSnapshot;
};

export type NamazMissedItem = {
  date: string;
  dayLabel: string;
  prayer: NamazPrayerKey;
  label: string;
};

export type NamazKazaQueueResponse = {
  trackingStart: string;
  madhabId?: "hanafi" | "shafi" | "maliki" | "hanbali";
  schedule?: NamazScheduleSnapshot;
  outstanding: NamazMissedItem[];
  count: number;
  completed?: {
    date: string;
    prayer: NamazPrayerKey;
    isKaza: boolean;
  };
};

export type NamazAnalyticsResponse = {
  appliedRange: {
    quick: string;
    from: string;
    to: string;
  };
  trackingStart?: string;
  kpis: {
    prayedInRange: number;
    kazaInRange: number;
    completedInRange: number;
    missedInRange: number;
    completionPct: number;
    streak: number;
    sunnahInRange: number;
    tasbeehInRange: number;
    zamaatInRange: number;
    finalizedExpected: number;
  };
  byPrayer: Array<{
    prayer: NamazPrayerKey;
    label: string;
    prayed: number;
    kaza: number;
    sunnah: number;
    tasbeeh: number;
    zamaat: number;
    missed: number;
  }>;
  daily: Array<{
    date: string;
    dayLabel: string;
    prayed: number;
    kaza: number;
    missed: number;
    pending: number;
  }>;
  missed: NamazMissedItem[];
  kazaLog: Array<{
    date: string;
    dayLabel: string;
    prayer: NamazPrayerKey;
    label: string;
    kazaAt: string | null;
  }>;
};
