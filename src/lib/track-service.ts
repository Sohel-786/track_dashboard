/**
 * Server-side orchestration for the journey map.
 *
 * The pipeline is deliberately one-directional:
 *
 *   raw fixes  →  stays (rebuilt, never patched)  →  named places  →  reports
 *
 * Each step only ever reads the one before it, so a bad detection setting or a
 * wrong OSM match is fixed by re-running a step rather than by repairing data.
 */

import mongoose from "mongoose";
import TrackPoint from "@/models/TrackPoint";
import TrackVisit, { type ITrackVisit } from "@/models/TrackVisit";
import MapPlace, { type IMapPlace } from "@/models/MapPlace";
import NamazLog from "@/models/NamazLog";
import User from "@/models/User";
import { distanceMeters, type LatLng } from "@/lib/geo";
import {
  buildTrips,
  detectStays,
  simplifyPath,
  summarizeTrack,
  type Stay,
  type TrackFix,
} from "@/lib/track-analysis";
import { getTrackingSettings, type TrackingSettings } from "@/lib/track-settings";
import { findMasjidsNear, reverseGeocode } from "@/lib/osm";
import { isoDateInTimeZone } from "@/lib/date-ranges";
import {
  NAMAZ_LOCATION_BASE,
  computePrayerWindows,
} from "@/lib/prayer-times";
import { NAMAZ_PRAYERS, NAMAZ_PRAYER_META, type NamazPrayer } from "@/lib/namaz";
import type { NamazMadhabId } from "@/lib/namaz-madhab";

/** Calendar day a fix belongs to, in the app's fixed prayer time zone. */
export function trackDateFor(ts: Date): string {
  return isoDateInTimeZone(ts, NAMAZ_LOCATION_BASE.timeZone);
}

/** Two stays this close in space and time are the same stay, re-detected. */
const CARRY_OVER_RADIUS_M = 75;
const CARRY_OVER_MINUTES = 10;

/** Give up naming a stay after this many failed passes. */
const MAX_RESOLVE_ATTEMPTS = 3;

type VisitDoc = ITrackVisit;

/* --------------------------------------------------------- visit rebuilds */

/**
 * Re-derive a day's visits from its raw fixes.
 *
 * Runs after every batch of new points, so it must be idempotent and must not
 * throw away work: a re-detected stay inherits the name that was already looked
 * up for it, because OSM lookups are the expensive part and the stay itself has
 * not actually changed just because two more fixes landed inside it.
 */
export async function rebuildVisitsForDay(
  userId: string,
  date: string,
  settings: TrackingSettings
): Promise<{ visits: number; created: number; removed: number }> {
  const raw = await TrackPoint.find({ userId, date })
    .select("ts lat lng accuracy speed")
    .sort({ ts: 1 })
    .lean();

  const fixes: TrackFix[] = raw.map((point) => ({
    ts: new Date(point.ts),
    lat: point.lat,
    lng: point.lng,
    accuracy: point.accuracy,
    speed: point.speed,
  }));

  const stays = detectStays(
    fixes,
    settings.stayRadiusMeters,
    settings.minStayMinutes
  );

  const existing = (await TrackVisit.find({ userId, date }).lean()) as VisitDoc[];

  /** The already-named stay this newly detected one is a redetection of. */
  const carryOverFor = (stay: Stay) =>
    existing.find(
      (visit) =>
        distanceMeters({ lat: visit.lat, lng: visit.lng }, stay) <=
          CARRY_OVER_RADIUS_M &&
        Math.abs(
          new Date(visit.startedAt).getTime() - stay.startedAt.getTime()
        ) <=
          CARRY_OVER_MINUTES * 60_000
    );

  let created = 0;
  const keptStartedAt: Date[] = [];

  for (const stay of stays) {
    const previous = carryOverFor(stay);
    keptStartedAt.push(stay.startedAt);

    const isNew = !existing.some(
      (visit) =>
        new Date(visit.startedAt).getTime() === stay.startedAt.getTime()
    );

    await TrackVisit.findOneAndUpdate(
      { userId, startedAt: stay.startedAt },
      {
        $set: {
          date,
          endedAt: stay.endedAt,
          durationMinutes: stay.durationMinutes,
          lat: stay.lat,
          lng: stay.lng,
          spreadMeters: stay.spreadMeters,
          pointCount: stay.pointCount,
          ...(previous
            ? {
                place: previous.place ?? null,
                placeName: previous.placeName ?? "",
                placeKind: previous.placeKind ?? "unknown",
                placeDistanceMeters: previous.placeDistanceMeters ?? null,
                resolvedAt: previous.resolvedAt ?? null,
                resolveAttempts: previous.resolveAttempts ?? 0,
                customName: previous.customName ?? "",
              }
            : {}),
        },
      },
      // No `new: true` — the updated document is not read back here.
      { upsert: true, setDefaultsOnInsert: true }
    );

    if (isNew) created += 1;
  }

  // Anything that is no longer a stay under the current settings must go.
  const removal = await TrackVisit.deleteMany({
    userId,
    date,
    startedAt: { $nin: keptStartedAt },
  });

  return {
    visits: stays.length,
    created,
    removed: removal.deletedCount ?? 0,
  };
}

/* ------------------------------------------------------------- resolution */

/**
 * Put names to unnamed stays.
 *
 * Masjids are asked about first and win on a tie, because they are the reason
 * this feature exists: a stay that sits inside a masjid's radius is recorded as
 * a visit to that masjid, and only the leftovers go to the general geocoder.
 * Network work is capped per call so a page load never waits on OSM.
 */
export async function resolvePendingVisits(
  userId: string,
  settings: TrackingSettings,
  limit = 5,
  budgetMs = 20_000
): Promise<{ resolved: number; masjids: number; remaining: number }> {
  const pending = (await TrackVisit.find({
    userId,
    resolvedAt: null,
    resolveAttempts: { $lt: MAX_RESOLVE_ATTEMPTS },
  })
    .sort({ startedAt: -1 })
    .limit(limit)
    .lean()) as VisitDoc[];

  let resolved = 0;
  let masjids = 0;
  /**
   * A first sweep of an unmapped area can take Overpass several seconds, and
   * the throttle adds a second between calls. Stopping on a deadline keeps the
   * request inside a serverless function's lifetime; whatever is left stays
   * pending and the next pass picks it up.
   */
  const deadline = Date.now() + budgetMs;

  for (const visit of pending) {
    if (Date.now() > deadline) break;

    const centre: LatLng = { lat: visit.lat, lng: visit.lng };
    await TrackVisit.updateOne(
      { _id: visit._id },
      { $inc: { resolveAttempts: 1 } }
    );

    let matched: IMapPlace | null = null;
    let kind: "masjid" | "place" | "unknown" = "unknown";

    const nearby = await findMasjidsNear(centre, settings.masjidRadiusMeters);
    if (nearby.length > 0) {
      matched = nearby[0];
      kind = "masjid";
    } else {
      const place = await reverseGeocode(centre);
      if (place) {
        matched = place;
        kind = "place";
      }
    }

    // OSM unreachable — leave it pending so a later pass can try again.
    if (!matched) continue;

    await TrackVisit.updateOne(
      { _id: visit._id },
      {
        $set: {
          place: matched._id,
          placeName: matched.name,
          placeKind: kind,
          placeDistanceMeters: Math.round(distanceMeters(centre, matched)),
          resolvedAt: new Date(),
        },
      }
    );

    resolved += 1;
    if (kind === "masjid") masjids += 1;
  }

  const remaining = await TrackVisit.countDocuments({
    userId,
    resolvedAt: null,
    resolveAttempts: { $lt: MAX_RESOLVE_ATTEMPTS },
  });

  return { resolved, masjids, remaining };
}

/* ----------------------------------------------------------------- shapes */

export type VisitView = {
  id: string;
  date: string;
  startedAt: string;
  endedAt: string;
  durationMinutes: number;
  lat: number;
  lng: number;
  spreadMeters: number;
  pointCount: number;
  /** Custom label if the user set one, else the OSM name, else a placeholder. */
  name: string;
  placeId: string | null;
  placeKind: "masjid" | "place" | "unknown";
  placeDistanceMeters: number | null;
  isMasjid: boolean;
  resolved: boolean;
  /**
   * A lookup is still owed. False once the stay has a name *or* the resolver
   * has given up on it — otherwise a stay OSM will never answer for would show
   * a spinner forever and keep the page asking.
   */
  pendingLookup: boolean;
  hasCustomName: boolean;
};

export function toVisitView(visit: VisitDoc): VisitView {
  const pendingLookup =
    !visit.resolvedAt &&
    (visit.resolveAttempts ?? 0) < MAX_RESOLVE_ATTEMPTS;

  const name =
    visit.customName ||
    visit.placeName ||
    (pendingLookup ? "Looking up…" : "Unnamed spot");

  return {
    id: String(visit._id),
    date: visit.date,
    startedAt: new Date(visit.startedAt).toISOString(),
    endedAt: new Date(visit.endedAt).toISOString(),
    durationMinutes: visit.durationMinutes,
    lat: visit.lat,
    lng: visit.lng,
    spreadMeters: visit.spreadMeters ?? 0,
    pointCount: visit.pointCount ?? 0,
    name,
    placeId: visit.place ? String(visit.place) : null,
    placeKind: (visit.placeKind ?? "unknown") as VisitView["placeKind"],
    placeDistanceMeters: visit.placeDistanceMeters ?? null,
    isMasjid: visit.placeKind === "masjid",
    resolved: Boolean(visit.resolvedAt),
    pendingLookup,
    hasCustomName: Boolean(visit.customName),
  };
}

/* -------------------------------------------------------------- day track */

export type DayTrack = {
  date: string;
  /** Simplified for drawing — the full track stays in the database. */
  path: Array<{ lat: number; lng: number; ts: string }>;
  visits: VisitView[];
  trips: Array<{
    startedAt: string;
    endedAt: string;
    durationMinutes: number;
    distanceMeters: number;
    averageSpeedKmh: number;
    fromName: string;
    toName: string;
  }>;
  summary: ReturnType<typeof summarizeTrack>;
};

export async function getDayTrack(
  userId: string,
  date: string,
  settings: TrackingSettings
): Promise<DayTrack> {
  const [raw, visitDocs] = await Promise.all([
    TrackPoint.find({ userId, date })
      .select("ts lat lng accuracy speed")
      .sort({ ts: 1 })
      .lean(),
    TrackVisit.find({ userId, date }).sort({ startedAt: 1 }).lean(),
  ]);

  const fixes: TrackFix[] = raw.map((point) => ({
    ts: new Date(point.ts),
    lat: point.lat,
    lng: point.lng,
    accuracy: point.accuracy,
    speed: point.speed,
  }));

  const visits = (visitDocs as VisitDoc[]).map(toVisitView);
  const stays: Stay[] = (visitDocs as VisitDoc[]).map((visit) => ({
    startedAt: new Date(visit.startedAt),
    endedAt: new Date(visit.endedAt),
    durationMinutes: visit.durationMinutes,
    lat: visit.lat,
    lng: visit.lng,
    spreadMeters: visit.spreadMeters ?? 0,
    pointCount: visit.pointCount ?? 0,
  }));

  const nameAt = (point: LatLng | null) => {
    if (!point) return "Unknown";
    const match = visits.find(
      (visit) =>
        distanceMeters({ lat: visit.lat, lng: visit.lng }, point) <
        settings.stayRadiusMeters
    );
    return match?.name ?? "Unknown";
  };

  const trips = buildTrips(fixes, stays).map((trip) => ({
    startedAt: trip.startedAt.toISOString(),
    endedAt: trip.endedAt.toISOString(),
    durationMinutes: trip.durationMinutes,
    distanceMeters: trip.distanceMeters,
    averageSpeedKmh: trip.averageSpeedKmh,
    fromName: nameAt(trip.from),
    toName: nameAt(trip.to),
  }));

  const path = simplifyPath(
    fixes.map((fix) => ({
      lat: fix.lat,
      lng: fix.lng,
      ts: fix.ts.toISOString(),
    })),
    8
  );

  return {
    date,
    path,
    visits,
    trips,
    summary: summarizeTrack(fixes, stays),
  };
}

/* ---------------------------------------------------------- range rollup */

export type DayRollup = {
  date: string;
  dayLabel: string;
  weekday: string;
  distanceMeters: number;
  movingMinutes: number;
  visitCount: number;
  masjidVisits: number;
  masjidMinutes: number;
  pointCount: number;
};

export type RangeOverview = {
  from: string;
  to: string;
  totals: {
    distanceMeters: number;
    movingMinutes: number;
    trackedDays: number;
    visitCount: number;
    masjidVisits: number;
    masjidMinutes: number;
    distinctMasjids: number;
    distinctPlaces: number;
    longestDayMeters: number;
    longestDayDate: string | null;
    averageDailyMeters: number;
  };
  daily: DayRollup[];
  /** Visits bucketed by hour of day — when this person is actually out. */
  byHour: Array<{ hour: number; visits: number; masjidVisits: number }>;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function labelForIsoDay(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return { dayLabel: date, weekday: "" };
  }
  return {
    dayLabel: `${parsed.getDate()} ${parsed.toLocaleString("en-IN", {
      month: "short",
    })}`,
    weekday: WEEKDAYS[parsed.getDay()],
  };
}

/**
 * Everything the journeys screen needs for a date range, in two queries.
 *
 * Distance has to be recomputed from raw fixes rather than summed from stored
 * per-day totals, because the noise filters in `summarizeTrack` only make sense
 * applied to a continuous track — summing pre-rounded days would drift.
 */
export async function getRangeOverview(
  userId: string,
  from: string,
  to: string
): Promise<RangeOverview> {
  const [points, visits] = await Promise.all([
    TrackPoint.find({ userId, date: { $gte: from, $lte: to } })
      .select("date ts lat lng accuracy")
      .sort({ ts: 1 })
      .lean(),
    TrackVisit.find({ userId, date: { $gte: from, $lte: to } })
      .sort({ startedAt: 1 })
      .lean() as Promise<VisitDoc[]>,
  ]);

  const fixesByDate = new Map<string, TrackFix[]>();
  for (const point of points) {
    const bucket = fixesByDate.get(point.date);
    const fix: TrackFix = {
      ts: new Date(point.ts),
      lat: point.lat,
      lng: point.lng,
      accuracy: point.accuracy,
    };
    if (bucket) bucket.push(fix);
    else fixesByDate.set(point.date, [fix]);
  }

  const visitsByDate = new Map<string, VisitDoc[]>();
  for (const visit of visits) {
    const bucket = visitsByDate.get(visit.date);
    if (bucket) bucket.push(visit);
    else visitsByDate.set(visit.date, [visit]);
  }

  const byHour = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    visits: 0,
    masjidVisits: 0,
  }));

  for (const visit of visits) {
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: NAMAZ_LOCATION_BASE.timeZone,
        hour: "2-digit",
        hourCycle: "h23",
      }).format(new Date(visit.startedAt))
    );
    if (Number.isFinite(hour) && hour >= 0 && hour < 24) {
      byHour[hour].visits += 1;
      if (visit.placeKind === "masjid") byHour[hour].masjidVisits += 1;
    }
  }

  const dates = [
    ...new Set([...fixesByDate.keys(), ...visitsByDate.keys()]),
  ].sort();

  const daily: DayRollup[] = dates.map((date) => {
    const fixes = fixesByDate.get(date) ?? [];
    const dayVisits = visitsByDate.get(date) ?? [];
    const masjid = dayVisits.filter((visit) => visit.placeKind === "masjid");
    const summary = summarizeTrack(fixes);

    return {
      date,
      ...labelForIsoDay(date),
      distanceMeters: summary.distanceMeters,
      movingMinutes: summary.movingMinutes,
      visitCount: dayVisits.length,
      masjidVisits: masjid.length,
      masjidMinutes: Math.round(
        masjid.reduce((total, visit) => total + visit.durationMinutes, 0)
      ),
      pointCount: fixes.length,
    };
  });

  const distanceMeters = daily.reduce((total, day) => total + day.distanceMeters, 0);
  const longest = daily.reduce<DayRollup | null>(
    (best, day) => (!best || day.distanceMeters > best.distanceMeters ? day : best),
    null
  );

  const masjidKey = (visit: VisitDoc) =>
    visit.place
      ? String(visit.place)
      : `${visit.lat.toFixed(3)},${visit.lng.toFixed(3)}`;
  const masjidVisits = visits.filter((visit) => visit.placeKind === "masjid");

  return {
    from,
    to,
    daily,
    byHour,
    totals: {
      distanceMeters,
      movingMinutes:
        Math.round(daily.reduce((total, day) => total + day.movingMinutes, 0) * 10) /
        10,
      trackedDays: daily.filter((day) => day.pointCount > 0).length,
      visitCount: visits.length,
      masjidVisits: masjidVisits.length,
      masjidMinutes: Math.round(
        masjidVisits.reduce((total, visit) => total + visit.durationMinutes, 0)
      ),
      distinctMasjids: new Set(masjidVisits.map(masjidKey)).size,
      distinctPlaces: new Set(visits.map(masjidKey)).size,
      longestDayMeters: longest?.distanceMeters ?? 0,
      longestDayDate: longest?.date ?? null,
      averageDailyMeters:
        daily.length > 0 ? Math.round(distanceMeters / daily.length) : 0,
    },
  };
}

/* ------------------------------------------------------------ place stats */

export type PlaceStat = {
  placeId: string | null;
  name: string;
  kind: "masjid" | "place" | "unknown";
  lat: number;
  lng: number;
  address: string;
  visitCount: number;
  totalMinutes: number;
  averageMinutes: number;
  longestMinutes: number;
  firstVisitAt: string;
  lastVisitAt: string;
  /** Distinct calendar days with at least one visit. */
  activeDays: number;
};

/**
 * Every place visited in a window, ranked by time spent.
 *
 * Grouped by resolved place id where there is one, and by rounded coordinates
 * otherwise — so a spot OSM has never heard of still accumulates a visit count
 * instead of appearing as a dozen unrelated one-off stays.
 */
export async function getPlaceStats(
  userId: string,
  from: string,
  to: string,
  kind?: "masjid"
): Promise<PlaceStat[]> {
  const query: Record<string, unknown> = {
    userId: new mongoose.Types.ObjectId(userId),
    date: { $gte: from, $lte: to },
  };
  if (kind) query.placeKind = kind;

  const visits = (await TrackVisit.find(query)
    .sort({ startedAt: 1 })
    .lean()) as VisitDoc[];

  const placeIds = visits
    .map((visit) => visit.place)
    .filter(Boolean) as mongoose.Types.ObjectId[];
  const places = (await MapPlace.find({ _id: { $in: placeIds } })
    .lean()) as IMapPlace[];
  const placeById = new Map(places.map((place) => [String(place._id), place]));

  type Bucket = PlaceStat & { days: Set<string> };
  const buckets = new Map<string, Bucket>();

  for (const visit of visits) {
    const place = visit.place ? placeById.get(String(visit.place)) : undefined;
    const key = place
      ? `place:${String(place._id)}`
      : `geo:${visit.lat.toFixed(3)},${visit.lng.toFixed(3)}`;

    const startedAt = new Date(visit.startedAt).toISOString();
    const endedAt = new Date(visit.endedAt).toISOString();
    const existing = buckets.get(key);

    if (existing) {
      existing.visitCount += 1;
      existing.totalMinutes += visit.durationMinutes;
      existing.longestMinutes = Math.max(
        existing.longestMinutes,
        visit.durationMinutes
      );
      existing.lastVisitAt = endedAt;
      existing.days.add(visit.date);
      // A later custom name is the user's most recent intent — honour it.
      if (visit.customName) existing.name = visit.customName;
      continue;
    }

    buckets.set(key, {
      placeId: place ? String(place._id) : null,
      name:
        visit.customName ||
        place?.name ||
        visit.placeName ||
        "Unnamed spot",
      kind: (visit.placeKind ?? "unknown") as PlaceStat["kind"],
      lat: place?.lat ?? visit.lat,
      lng: place?.lng ?? visit.lng,
      address: place?.address ?? "",
      visitCount: 1,
      totalMinutes: visit.durationMinutes,
      averageMinutes: visit.durationMinutes,
      longestMinutes: visit.durationMinutes,
      firstVisitAt: startedAt,
      lastVisitAt: endedAt,
      activeDays: 0,
      days: new Set([visit.date]),
    });
  }

  return [...buckets.values()]
    .map(({ days, ...stat }) => ({
      ...stat,
      totalMinutes: Math.round(stat.totalMinutes),
      averageMinutes: Math.round(stat.totalMinutes / stat.visitCount),
      longestMinutes: Math.round(stat.longestMinutes),
      activeDays: days.size,
    }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes);
}

/* --------------------------------------------------- masjid × namaz join */

export type MasjidVisitRow = {
  visitId: string;
  date: string;
  startedAt: string;
  endedAt: string;
  durationMinutes: number;
  /**
   * Prayers whose window overlapped this visit and which are logged as prayed —
   * the join that turns "you were at the masjid" into "you prayed Zohar there".
   */
  prayers: Array<{
    prayer: NamazPrayer;
    label: string;
    onTime: boolean;
    zamaat: boolean;
    sunnah: boolean;
  }>;
};

export type MasjidReport = {
  placeId: string | null;
  name: string;
  address: string;
  lat: number;
  lng: number;
  visitCount: number;
  totalMinutes: number;
  averageMinutes: number;
  longestMinutes: number;
  activeDays: number;
  firstVisitAt: string;
  lastVisitAt: string;
  /** Prayers logged while inside this masjid, across the whole window. */
  prayerCount: number;
  zamaatCount: number;
  visits: MasjidVisitRow[];
};

/**
 * Masjid visits with the prayers that happened inside them.
 *
 * Matching is by window overlap rather than by when the checkbox was ticked: a
 * stay that covers the Magrib window on a day Magrib is logged as prayed is
 * counted as Magrib at that masjid, whether the user ticked it there or on the
 * way home.
 */
export async function getMasjidReport(
  userId: string,
  from: string,
  to: string,
  madhabId: NamazMadhabId
): Promise<MasjidReport[]> {
  const visits = (await TrackVisit.find({
    userId: new mongoose.Types.ObjectId(userId),
    placeKind: "masjid",
    date: { $gte: from, $lte: to },
  })
    .sort({ startedAt: 1 })
    .lean()) as VisitDoc[];

  if (visits.length === 0) return [];

  const dates = [...new Set(visits.map((visit) => visit.date))];
  const logs = await NamazLog.find({
    userId,
    date: { $in: dates },
    prayed: true,
  })
    .select("date prayer isKaza zamaat sunnah")
    .lean();

  const logKey = (date: string, prayer: string) => `${date}:${prayer}`;
  const logByKey = new Map(
    logs.map((log) => [logKey(log.date, log.prayer), log])
  );

  /** Prayer windows are the same for every visit on a day — compute once. */
  const windowsByDate = new Map(
    dates.map((date) => [date, computePrayerWindows(date, new Date(), madhabId)])
  );

  const placeIds = visits
    .map((visit) => visit.place)
    .filter(Boolean) as mongoose.Types.ObjectId[];
  const places = (await MapPlace.find({ _id: { $in: placeIds } })
    .lean()) as IMapPlace[];
  const placeById = new Map(places.map((place) => [String(place._id), place]));

  type Bucket = Omit<MasjidReport, "averageMinutes" | "activeDays"> & {
    days: Set<string>;
  };
  const buckets = new Map<string, Bucket>();

  for (const visit of visits) {
    const place = visit.place ? placeById.get(String(visit.place)) : undefined;
    const key = place
      ? `place:${String(place._id)}`
      : `geo:${visit.lat.toFixed(3)},${visit.lng.toFixed(3)}`;

    const startMs = new Date(visit.startedAt).getTime();
    const endMs = new Date(visit.endedAt).getTime();
    const windows = windowsByDate.get(visit.date);

    const prayers: MasjidVisitRow["prayers"] = [];
    if (windows) {
      for (const prayer of NAMAZ_PRAYERS) {
        const window = windows[prayer];
        const overlaps =
          startMs <= window.end.getTime() && endMs >= window.start.getTime();
        if (!overlaps) continue;

        const log = logByKey.get(logKey(visit.date, prayer));
        if (!log) continue;

        prayers.push({
          prayer,
          label: NAMAZ_PRAYER_META[prayer].label,
          onTime: !log.isKaza,
          zamaat: Boolean(log.zamaat),
          sunnah: Boolean(log.sunnah),
        });
      }
    }

    const row: MasjidVisitRow = {
      visitId: String(visit._id),
      date: visit.date,
      startedAt: new Date(visit.startedAt).toISOString(),
      endedAt: new Date(visit.endedAt).toISOString(),
      durationMinutes: Math.round(visit.durationMinutes),
      prayers,
    };

    const zamaatHere = prayers.filter((entry) => entry.zamaat).length;
    const bucket = buckets.get(key);

    if (bucket) {
      bucket.visitCount += 1;
      bucket.totalMinutes += visit.durationMinutes;
      bucket.longestMinutes = Math.max(
        bucket.longestMinutes,
        visit.durationMinutes
      );
      bucket.lastVisitAt = row.endedAt;
      bucket.prayerCount += prayers.length;
      bucket.zamaatCount += zamaatHere;
      bucket.days.add(visit.date);
      bucket.visits.push(row);
      if (visit.customName) bucket.name = visit.customName;
      continue;
    }

    buckets.set(key, {
      placeId: place ? String(place._id) : null,
      name: visit.customName || place?.name || visit.placeName || "Masjid",
      address: place?.address ?? "",
      lat: place?.lat ?? visit.lat,
      lng: place?.lng ?? visit.lng,
      visitCount: 1,
      totalMinutes: visit.durationMinutes,
      longestMinutes: visit.durationMinutes,
      firstVisitAt: row.startedAt,
      lastVisitAt: row.endedAt,
      prayerCount: prayers.length,
      zamaatCount: zamaatHere,
      visits: [row],
      days: new Set([visit.date]),
    });
  }

  return [...buckets.values()]
    .map(({ days, ...bucket }) => ({
      ...bucket,
      totalMinutes: Math.round(bucket.totalMinutes),
      longestMinutes: Math.round(bucket.longestMinutes),
      averageMinutes: Math.round(bucket.totalMinutes / bucket.visitCount),
      activeDays: days.size,
      // Newest first reads better in a log.
      visits: bucket.visits.sort((a, b) =>
        b.startedAt.localeCompare(a.startedAt)
      ),
    }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes);
}

/* ------------------------------------------------------------- retention */

/** Drop raw fixes and their derived visits past the account's retention age. */
export async function purgeExpiredPoints(
  userId: string,
  retentionDays: number
): Promise<number> {
  if (retentionDays <= 0) return 0;

  const cutoff = trackDateFor(
    new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
  );

  const [points] = await Promise.all([
    TrackPoint.deleteMany({ userId, date: { $lt: cutoff } }),
    TrackVisit.deleteMany({ userId, date: { $lt: cutoff } }),
  ]);

  return points.deletedCount ?? 0;
}

/**
 * Background upkeep for every account with tracking on.
 *
 * Naming a stay costs an OSM round trip, and those are rate-limited to roughly
 * one a second by policy — so this runs on the same schedule as the prayer
 * reminders and does a little each time, rather than making anyone wait for a
 * backlog when they open the map. The deadline is what keeps it inside a
 * serverless function's lifetime.
 */
export async function runTrackMaintenance(
  budgetMs = 35_000
): Promise<{
  users: number;
  resolved: number;
  masjids: number;
  purged: number;
  remaining: number;
}> {
  const deadline = Date.now() + budgetMs;

  const userIds = await User.find({ trackingEnabled: true })
    .select("_id")
    .lean();

  let resolved = 0;
  let masjids = 0;
  let purged = 0;
  let remaining = 0;

  for (const user of userIds) {
    const userId = String(user._id);
    const settings = await getTrackingSettings(userId);

    purged += await purgeExpiredPoints(userId, settings.retentionDays);

    if (Date.now() < deadline) {
      const result = await resolvePendingVisits(
        userId,
        settings,
        4,
        Math.max(2_000, deadline - Date.now())
      );
      resolved += result.resolved;
      masjids += result.masjids;
      remaining += result.remaining;
    } else {
      remaining += await TrackVisit.countDocuments({
        userId,
        resolvedAt: null,
      });
    }
  }

  return { users: userIds.length, resolved, masjids, purged, remaining };
}

/** Everything this account's tracking ever recorded. Not recoverable. */
export async function deleteAllTrackingData(userId: string) {
  const [points, visits] = await Promise.all([
    TrackPoint.deleteMany({ userId }),
    TrackVisit.deleteMany({ userId }),
  ]);
  return {
    points: points.deletedCount ?? 0,
    visits: visits.deletedCount ?? 0,
  };
}
