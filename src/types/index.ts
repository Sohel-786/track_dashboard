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
