/**
 * Turning a stream of GPS fixes into something a person can read.
 *
 * A raw track is thousands of near-identical points. What anyone actually wants
 * to know is: where did I stop, for how long, and how far did I move between
 * stops. Everything in this file exists to answer that, and all of it is pure —
 * the same points always produce the same visits, which is what makes the day
 * rebuild in `rebuildVisitsForDay` safe to run over and over.
 */

import { centroid, distanceMeters, type LatLng } from "@/lib/geo";

export type TrackFix = {
  ts: Date;
  lat: number;
  lng: number;
  accuracy?: number | null;
  speed?: number | null;
};

/**
 * A fix this far off is a cell-tower guess, not a position. Including them
 * would inflate the day's distance with jumps across the neighbourhood.
 */
const MAX_USABLE_ACCURACY_M = 120;

/**
 * Below this, consecutive fixes are the same spot seen twice — GPS jitter while
 * standing still, which would otherwise accumulate into kilometres of phantom
 * walking over a day.
 */
const MIN_SEGMENT_METERS = 12;

/** 250 km/h. Anything faster is a GPS glitch, not travel. */
const MAX_PLAUSIBLE_SPEED_MS = 70;

/**
 * Fixes further apart in time than this are two separate sessions, not one
 * journey. The path between them is unknown, so it is neither drawn nor
 * counted, and a stay is never inferred across the gap.
 */
const MAX_SEGMENT_GAP_MINUTES = 20;

export type Stay = {
  startedAt: Date;
  endedAt: Date;
  durationMinutes: number;
  lat: number;
  lng: number;
  /** Furthest any fix in the stay sat from its centre. */
  spreadMeters: number;
  pointCount: number;
};

export type Trip = {
  startedAt: Date;
  endedAt: Date;
  durationMinutes: number;
  distanceMeters: number;
  /** Straight-line km/h over the segment; useful for guessing the mode. */
  averageSpeedKmh: number;
  from: LatLng | null;
  to: LatLng | null;
};

export type TrackSummary = {
  distanceMeters: number;
  /** Minutes spent actually moving, ignoring time parked somewhere. */
  movingMinutes: number;
  /** Minutes inside a detected stay. */
  stationaryMinutes: number;
  /** First fix to last fix. */
  trackedMinutes: number;
  maxSpeedKmh: number;
  averageSpeedKmh: number;
  pointCount: number;
  firstAt: string | null;
  lastAt: string | null;
};

/** Drop unusable fixes and put the rest in time order. */
export function cleanFixes(fixes: TrackFix[]): TrackFix[] {
  return fixes
    .filter(
      (fix) =>
        Number.isFinite(fix.lat) &&
        Number.isFinite(fix.lng) &&
        (fix.accuracy == null || fix.accuracy <= MAX_USABLE_ACCURACY_M)
    )
    .sort((a, b) => a.ts.getTime() - b.ts.getTime());
}

function minutesBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 60_000;
}

/**
 * Stay detection.
 *
 * Walks the track and grows a run of fixes while the person is plausibly still
 * in one place, then keeps the runs that lasted at least `minStayMinutes`.
 *
 * Staying still has to be tested two ways, because either test alone is wrong:
 *
 *   - **against the run's centre**, which tolerates the slow drift of an indoor
 *     fix and stops a long stay being split in half mid-prayer;
 *   - **against the run's first fix**, which bounds how far the run may span in
 *     total. Without it a straight walk registers as a stay: every point of a
 *     160 m line sits within 80 m of that line's own midpoint, so a slow stroll
 *     past the shops would be logged as standing outside them.
 *
 * Requiring both means a run may wander inside the radius but may never travel
 * across it, which is the actual difference between being somewhere and going
 * past it.
 */
export function detectStays(
  fixes: TrackFix[],
  stayRadiusMeters: number,
  minStayMinutes: number
): Stay[] {
  const points = cleanFixes(fixes);
  const stays: Stay[] = [];
  let index = 0;

  while (index < points.length) {
    const anchor = points[index];
    const run: TrackFix[] = [anchor];
    let centre: LatLng = { lat: anchor.lat, lng: anchor.lng };
    let end = index + 1;

    while (end < points.length) {
      const next = points[end];
      // A long silence breaks the run: we cannot claim they never left.
      if (minutesBetween(run[run.length - 1].ts, next.ts) > MAX_SEGMENT_GAP_MINUTES) {
        break;
      }
      // Progress away from where the run began is travel, not a stay.
      if (distanceMeters(anchor, next) > stayRadiusMeters) break;

      const candidate = centroid([...run, next]);
      if (distanceMeters(candidate, next) > stayRadiusMeters) break;
      // Re-check the whole run against the new centre so it cannot creep away.
      if (run.some((fix) => distanceMeters(candidate, fix) > stayRadiusMeters)) {
        break;
      }
      run.push(next);
      centre = candidate;
      end += 1;
    }

    const startedAt = run[0].ts;
    const endedAt = run[run.length - 1].ts;
    const durationMinutes = minutesBetween(startedAt, endedAt);

    if (run.length >= 2 && durationMinutes >= minStayMinutes) {
      stays.push({
        startedAt,
        endedAt,
        durationMinutes: Math.round(durationMinutes * 10) / 10,
        lat: centre.lat,
        lng: centre.lng,
        spreadMeters: Math.round(
          Math.max(...run.map((fix) => distanceMeters(centre, fix)))
        ),
        pointCount: run.length,
      });
      index = end;
    } else {
      index += 1;
    }
  }

  return stays;
}

/**
 * Distance and time over a track, with the noise taken out.
 *
 * Segments are ignored when they are too short to be real movement, too fast to
 * be possible, or separated by a gap long enough that the route between them is
 * unknown. The result is deliberately conservative: it is better to under-report
 * a journey than to invent one out of jitter.
 */
export function summarizeTrack(fixes: TrackFix[], stays: Stay[] = []): TrackSummary {
  const points = cleanFixes(fixes);

  if (points.length === 0) {
    return {
      distanceMeters: 0,
      movingMinutes: 0,
      stationaryMinutes: 0,
      trackedMinutes: 0,
      maxSpeedKmh: 0,
      averageSpeedKmh: 0,
      pointCount: 0,
      firstAt: null,
      lastAt: null,
    };
  }

  let distance = 0;
  let movingMs = 0;
  let maxSpeedMs = 0;

  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1];
    const current = points[i];
    const elapsedMs = current.ts.getTime() - previous.ts.getTime();
    if (elapsedMs <= 0) continue;
    if (elapsedMs > MAX_SEGMENT_GAP_MINUTES * 60_000) continue;

    const step = distanceMeters(previous, current);
    if (step < MIN_SEGMENT_METERS) continue;

    const speed = step / (elapsedMs / 1000);
    if (speed > MAX_PLAUSIBLE_SPEED_MS) continue;

    distance += step;
    movingMs += elapsedMs;
    if (speed > maxSpeedMs) maxSpeedMs = speed;
  }

  const stationaryMinutes = stays.reduce(
    (total, stay) => total + stay.durationMinutes,
    0
  );
  const movingMinutes = movingMs / 60_000;
  const trackedMinutes = minutesBetween(
    points[0].ts,
    points[points.length - 1].ts
  );

  return {
    distanceMeters: Math.round(distance),
    movingMinutes: Math.round(movingMinutes * 10) / 10,
    stationaryMinutes: Math.round(stationaryMinutes * 10) / 10,
    trackedMinutes: Math.round(trackedMinutes * 10) / 10,
    maxSpeedKmh: Math.round(maxSpeedMs * 3.6 * 10) / 10,
    averageSpeedKmh:
      movingMinutes > 0
        ? Math.round((distance / 1000 / (movingMinutes / 60)) * 10) / 10
        : 0,
    pointCount: points.length,
    firstAt: points[0].ts.toISOString(),
    lastAt: points[points.length - 1].ts.toISOString(),
  };
}

/**
 * Two stays with barely any ground between them are one interrupted stay, not a
 * journey. Listing that seam as a trip is noise on an otherwise readable day.
 */
const MIN_TRIP_METERS = 50;

/**
 * The journeys between stays — one trip per gap in the visit list, measured
 * along the fixes that fall inside that gap rather than as the crow flies.
 */
export function buildTrips(fixes: TrackFix[], stays: Stay[]): Trip[] {
  const points = cleanFixes(fixes);
  if (points.length < 2 || stays.length === 0) return [];

  const trips: Trip[] = [];
  const ordered = [...stays].sort(
    (a, b) => a.startedAt.getTime() - b.startedAt.getTime()
  );

  for (let i = 0; i < ordered.length - 1; i += 1) {
    const from = ordered[i];
    const to = ordered[i + 1];
    const leg = points.filter(
      (fix) =>
        fix.ts.getTime() >= from.endedAt.getTime() &&
        fix.ts.getTime() <= to.startedAt.getTime()
    );
    if (leg.length < 2) continue;

    const summary = summarizeTrack(leg);
    if (summary.distanceMeters < MIN_TRIP_METERS) continue;

    const durationMinutes = minutesBetween(from.endedAt, to.startedAt);

    trips.push({
      startedAt: from.endedAt,
      endedAt: to.startedAt,
      durationMinutes: Math.round(durationMinutes * 10) / 10,
      distanceMeters: summary.distanceMeters,
      averageSpeedKmh: summary.averageSpeedKmh,
      from: { lat: from.lat, lng: from.lng },
      to: { lat: to.lat, lng: to.lng },
    });
  }

  return trips;
}

/**
 * Thin a track down for drawing.
 *
 * Ramer–Douglas–Peucker on the polyline: keeps every point that changes the
 * shape by more than `toleranceMeters` and drops the rest. A day of standing
 * still collapses to two points; a drive keeps every turn.
 */
export function simplifyPath<T extends LatLng>(
  path: T[],
  toleranceMeters = 8
): T[] {
  if (path.length <= 2) return path;

  const keep = new Array<boolean>(path.length).fill(false);
  keep[0] = true;
  keep[path.length - 1] = true;

  const stack: Array<[number, number]> = [[0, path.length - 1]];

  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let maxDistance = 0;
    let farthest = -1;

    for (let i = first + 1; i < last; i += 1) {
      const distance = perpendicularDistance(path[i], path[first], path[last]);
      if (distance > maxDistance) {
        maxDistance = distance;
        farthest = i;
      }
    }

    if (farthest !== -1 && maxDistance > toleranceMeters) {
      keep[farthest] = true;
      stack.push([first, farthest], [farthest, last]);
    }
  }

  return path.filter((_, index) => keep[index]);
}

/**
 * Distance from `point` to the segment `start`–`end`, in metres.
 * Latitude/longitude are projected to a local flat plane first, which is exact
 * enough over the few hundred metres a single segment ever spans.
 */
function perpendicularDistance(point: LatLng, start: LatLng, end: LatLng): number {
  const metresPerDegreeLat = 111_320;
  const metresPerDegreeLng =
    metresPerDegreeLat * Math.cos((start.lat * Math.PI) / 180);

  const px = (point.lng - start.lng) * metresPerDegreeLng;
  const py = (point.lat - start.lat) * metresPerDegreeLat;
  const ex = (end.lng - start.lng) * metresPerDegreeLng;
  const ey = (end.lat - start.lat) * metresPerDegreeLat;

  const lengthSquared = ex * ex + ey * ey;
  if (lengthSquared === 0) return Math.hypot(px, py);

  const t = Math.max(0, Math.min(1, (px * ex + py * ey) / lengthSquared));
  return Math.hypot(px - t * ex, py - t * ey);
}
