/**
 * Pure geodesy helpers shared by the tracking pipeline and the map UI.
 *
 * Everything here is dependency-free maths on WGS-84 coordinates. No network,
 * no API keys — distance, bearing, bounding boxes and Qibla are all closed-form.
 */

export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_M = 6_371_008.8;
const DEG = Math.PI / 180;

/** The Kaaba, Masjid al-Haram, Makkah — the Qibla target. */
export const KAABA: LatLng = { lat: 21.4224779, lng: 39.8251832 };

export function isFiniteLatLng(value: unknown): value is LatLng {
  if (!value || typeof value !== "object") return false;
  const { lat, lng } = value as LatLng;
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * Great-circle distance in metres (haversine).
 *
 * Accurate to ~0.5% worst case, which is far below GPS noise at the scales this
 * app deals with (metres to tens of kilometres).
 */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * DEG;
  const dLng = (b.lng - a.lng) * DEG;
  const lat1 = a.lat * DEG;
  const lat2 = b.lat * DEG;

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from `a` to `b`, in degrees clockwise from true north. */
export function bearingDegrees(a: LatLng, b: LatLng): number {
  const lat1 = a.lat * DEG;
  const lat2 = b.lat * DEG;
  const dLng = (b.lng - a.lng) * DEG;

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  return (Math.atan2(y, x) / DEG + 360) % 360;
}

/** Compass bearing to the Kaaba from anywhere on earth. */
export function qiblaBearing(from: LatLng): number {
  return bearingDegrees(from, KAABA);
}

export const COMPASS_POINTS = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
] as const;

export function compassPoint(bearing: number): string {
  const index = Math.round(((bearing % 360) + 360) % 360 / 22.5) % 16;
  return COMPASS_POINTS[index];
}

/** Arithmetic centre of a cluster of fixes. Fine at city scale. */
export function centroid(points: LatLng[]): LatLng {
  if (points.length === 0) return { lat: 0, lng: 0 };
  let lat = 0;
  let lng = 0;
  for (const p of points) {
    lat += p.lat;
    lng += p.lng;
  }
  return { lat: lat / points.length, lng: lng / points.length };
}

export type BoundingBox = {
  south: number;
  west: number;
  north: number;
  east: number;
};

/** Square-ish box of `radiusMeters` around a point, for an Overpass query. */
export function boundingBox(center: LatLng, radiusMeters: number): BoundingBox {
  const latDelta = (radiusMeters / EARTH_RADIUS_M) / DEG;
  const cos = Math.max(0.01, Math.cos(center.lat * DEG));
  const lngDelta = latDelta / cos;
  return {
    south: center.lat - latDelta,
    west: center.lng - lngDelta,
    north: center.lat + latDelta,
    east: center.lng + lngDelta,
  };
}

/* ------------------------------------------------------------- formatting */

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return "—";
  if (meters < 950) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return `${km < 10 ? km.toFixed(2) : km.toFixed(1)} km`;
}

export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return "—";
  const total = Math.round(minutes);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

export function formatSpeed(metersPerSecond: number | null | undefined): string {
  if (metersPerSecond == null || !Number.isFinite(metersPerSecond)) return "—";
  return `${(metersPerSecond * 3.6).toFixed(1)} km/h`;
}

/**
 * Grid key for caching geocode lookups. ~11 m at the equator, which is well
 * inside GPS noise, so two fixes of the same doorway share one cache entry.
 */
export function geoCacheKey(point: LatLng, decimals = 4): string {
  return `${point.lat.toFixed(decimals)},${point.lng.toFixed(decimals)}`;
}
