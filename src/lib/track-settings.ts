import User from "@/models/User";

/**
 * Per-account tracking preferences.
 *
 * `enabled` is the consent flag and starts false: TrackDash records nobody's
 * movements until that account turns it on itself. Everything else tunes how
 * raw fixes are read — a wider `stayRadiusMeters` forgives GPS drift indoors,
 * a longer `minStayMinutes` stops a traffic light being logged as a visit.
 */
export type TrackingSettings = {
  enabled: boolean;
  autoStart: boolean;
  highAccuracy: boolean;
  stayRadiusMeters: number;
  minStayMinutes: number;
  masjidRadiusMeters: number;
  /** 0 = keep forever. */
  retentionDays: number;
};

export const DEFAULT_TRACKING_SETTINGS: TrackingSettings = {
  enabled: false,
  autoStart: false,
  highAccuracy: true,
  stayRadiusMeters: 80,
  minStayMinutes: 5,
  masjidRadiusMeters: 150,
  retentionDays: 0,
};

export const TRACKING_LIMITS = {
  stayRadiusMeters: { min: 20, max: 500 },
  minStayMinutes: { min: 1, max: 120 },
  masjidRadiusMeters: { min: 30, max: 600 },
  retentionDays: { min: 0, max: 3650 },
} as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export async function getTrackingSettings(
  userId: string
): Promise<TrackingSettings> {
  const user = await User.findById(userId)
    .select(
      "trackingEnabled trackingAutoStart trackingHighAccuracy " +
        "trackingStayRadiusMeters trackingMinStayMinutes " +
        "trackingMasjidRadiusMeters trackingRetentionDays"
    )
    .lean();

  if (!user) return { ...DEFAULT_TRACKING_SETTINGS };

  return {
    enabled: user.trackingEnabled ?? DEFAULT_TRACKING_SETTINGS.enabled,
    autoStart: user.trackingAutoStart ?? DEFAULT_TRACKING_SETTINGS.autoStart,
    highAccuracy:
      user.trackingHighAccuracy ?? DEFAULT_TRACKING_SETTINGS.highAccuracy,
    stayRadiusMeters: clamp(
      user.trackingStayRadiusMeters ??
        DEFAULT_TRACKING_SETTINGS.stayRadiusMeters,
      TRACKING_LIMITS.stayRadiusMeters.min,
      TRACKING_LIMITS.stayRadiusMeters.max
    ),
    minStayMinutes: clamp(
      user.trackingMinStayMinutes ?? DEFAULT_TRACKING_SETTINGS.minStayMinutes,
      TRACKING_LIMITS.minStayMinutes.min,
      TRACKING_LIMITS.minStayMinutes.max
    ),
    masjidRadiusMeters: clamp(
      user.trackingMasjidRadiusMeters ??
        DEFAULT_TRACKING_SETTINGS.masjidRadiusMeters,
      TRACKING_LIMITS.masjidRadiusMeters.min,
      TRACKING_LIMITS.masjidRadiusMeters.max
    ),
    retentionDays: clamp(
      user.trackingRetentionDays ?? DEFAULT_TRACKING_SETTINGS.retentionDays,
      TRACKING_LIMITS.retentionDays.min,
      TRACKING_LIMITS.retentionDays.max
    ),
  };
}
