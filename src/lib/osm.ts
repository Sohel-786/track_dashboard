/**
 * OpenStreetMap lookups — masjid search (Overpass) and place naming
 * (Nominatim). Server-only.
 *
 * Both endpoints are free and keyless, which is the whole reason they are what
 * this app uses. What they ask for in return is restraint, and this module is
 * where that is honoured:
 *
 *   - every call is made from the server, never the browser, so the app's CSP
 *     stays locked to 'self' and one identifiable User-Agent is presented;
 *   - results are written to `MapPlace` / `MapAreaScan` and answered from there
 *     on the next lookup, including negative results;
 *   - calls are serialised through a process-local queue with a minimum gap,
 *     because Nominatim's usage policy is one request per second.
 *
 * If a lookup fails the caller gets null and the visit simply stays unnamed —
 * a nameless stay is still a stay, and the map does not depend on OSM being up.
 */

import connectDB from "@/lib/mongodb";
import MapPlace, { type IMapPlace } from "@/models/MapPlace";
import MapAreaScan from "@/models/MapAreaScan";
import {
  boundingBox,
  distanceMeters,
  geoCacheKey,
  type LatLng,
} from "@/lib/geo";

/** Overpass mirrors, tried in order. All free, all run on donations. */
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const NOMINATIM_REVERSE = "https://nominatim.openstreetmap.org/reverse";

/** Nominatim's usage policy: at most one request per second, per client. */
const MIN_REQUEST_GAP_MS = 1_100;
const REQUEST_TIMEOUT_MS = 20_000;

/** A swept cell is trusted for a month — masjids do not move. */
const AREA_SCAN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Identifies the deployment to OSM's operators, as their policy requires.
 * `MAP_CONTACT` is optional — set it to an email or URL so they can reach you
 * before they resort to rate-limiting.
 */
function userAgent(): string {
  const subject = process.env.VAPID_SUBJECT?.trim() ?? "";
  const contact =
    process.env.MAP_CONTACT?.trim() ||
    (subject.startsWith("mailto:") ? subject.slice("mailto:".length) : "");
  return `TrackDash/1.0 (self-hosted prayer tracker${contact ? `; ${contact}` : ""})`;
}

/* --------------------------------------------------------------- throttle */

let lastRequestAt = 0;
let chain: Promise<unknown> = Promise.resolve();

/** Serialise every outbound OSM call and keep a polite gap between them. */
function throttled<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = MIN_REQUEST_GAP_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    try {
      return await task();
    } finally {
      lastRequestAt = Date.now();
    }
  });
  // Keep the chain alive even when a task rejects.
  chain = run.catch(() => undefined);
  return run;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "User-Agent": userAgent(),
        "Accept-Language": "en",
        ...(init.headers || {}),
      },
      cache: "no-store",
    });
  } finally {
    clearTimeout(timer);
  }
}

/* --------------------------------------------------------------- overpass */

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

/**
 * Every way OSM records a mosque. `religion=muslim` on a place of worship is
 * the canonical tagging; `building=mosque` catches buildings mapped before that
 * convention settled, which is common outside Europe.
 */
function overpassQuery(box: ReturnType<typeof boundingBox>): string {
  const bbox = `${box.south},${box.west},${box.north},${box.east}`;
  const worship = `["amenity"="place_of_worship"]["religion"="muslim"]`;
  return [
    "[out:json][timeout:20];",
    "(",
    `  node${worship}(${bbox});`,
    `  way${worship}(${bbox});`,
    `  relation${worship}(${bbox});`,
    `  node["building"="mosque"](${bbox});`,
    `  way["building"="mosque"](${bbox});`,
    ");",
    "out center tags;",
  ].join("\n");
}

/** Tags worth keeping. The rest is noise for this app's purposes. */
const KEEP_TAGS = [
  "denomination",
  "opening_hours",
  "phone",
  "website",
  "wheelchair",
  "addr:street",
  "addr:city",
  "addr:postcode",
] as const;

function pickTags(tags: Record<string, string> = {}) {
  const kept: Record<string, string> = {};
  for (const key of KEEP_TAGS) {
    const value = tags[key];
    if (value) kept[key] = value.slice(0, 120);
  }
  return kept;
}

function addressFromTags(tags: Record<string, string> = {}): string {
  return [tags["addr:housenumber"], tags["addr:street"], tags["addr:city"]]
    .filter(Boolean)
    .join(", ")
    .slice(0, 400);
}

/**
 * A masjid with no `name` tag is still a masjid. Falling back through the
 * local-name variants and then to a generic label keeps it on the map rather
 * than discarding it over a missing string.
 */
function nameFromTags(tags: Record<string, string> = {}): string {
  return (
    tags.name ||
    tags["name:en"] ||
    tags["name:ur"] ||
    tags["name:hi"] ||
    tags.alt_name ||
    tags.official_name ||
    "Unnamed masjid"
  ).slice(0, 200);
}

async function callOverpass(query: string): Promise<OverpassElement[] | null> {
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await throttled(() =>
        fetchWithTimeout(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `data=${encodeURIComponent(query)}`,
        })
      );
      if (!response.ok) continue;
      const payload = (await response.json()) as {
        elements?: OverpassElement[];
      };
      return Array.isArray(payload.elements) ? payload.elements : [];
    } catch {
      // Mirror down or slow — fall through to the next one.
    }
  }
  return null;
}

/**
 * Every masjid OSM knows about within `radiusMeters` of `center`, cached.
 *
 * The first call for an area hits Overpass and stores what it finds; later
 * calls for the same cell are answered from MongoDB until the scan ages out.
 */
export async function findMasjidsNear(
  center: LatLng,
  radiusMeters = 400
): Promise<IMapPlace[]> {
  await connectDB();

  const sweepRadius = Math.max(radiusMeters, 400);
  const cell = geoCacheKey(center, 3); // ~110 m cell
  const scan = await MapAreaScan.findOne({ cell }).lean();
  const fresh =
    scan &&
    scan.radiusMeters >= sweepRadius &&
    Date.now() - new Date(scan.scannedAt).getTime() < AREA_SCAN_TTL_MS;

  if (!fresh) {
    const elements = await callOverpass(
      overpassQuery(boundingBox(center, sweepRadius))
    );

    // A failed sweep is not a scanned area — leave it to be retried later.
    if (elements) {
      for (const element of elements) {
        const lat = element.lat ?? element.center?.lat;
        const lng = element.lon ?? element.center?.lon;
        if (lat == null || lng == null) continue;

        await MapPlace.findOneAndUpdate(
          { key: `${element.type}/${element.id}` },
          {
            $set: {
              name: nameFromTags(element.tags),
              kind: "masjid",
              lat,
              lng,
              address: addressFromTags(element.tags),
              osmType: element.type,
              osmId: element.id,
              source: "overpass",
              tags: pickTags(element.tags),
              fetchedAt: new Date(),
            },
          },
          { upsert: true, setDefaultsOnInsert: true }
        );
      }

      await MapAreaScan.findOneAndUpdate(
        { cell },
        {
          $set: {
            radiusMeters: sweepRadius,
            found: elements.length,
            scannedAt: new Date(),
          },
        },
        { upsert: true, setDefaultsOnInsert: true }
      );
    }
  }

  const box = boundingBox(center, radiusMeters);
  const candidates = (await MapPlace.find({
    kind: "masjid",
    lat: { $gte: box.south, $lte: box.north },
    lng: { $gte: box.west, $lte: box.east },
  }).lean()) as IMapPlace[];

  // The box is a square; the radius is a circle. Trim the corners.
  return candidates
    .filter((place) => distanceMeters(center, place) <= radiusMeters)
    .sort(
      (a, b) => distanceMeters(center, a) - distanceMeters(center, b)
    );
}

/* -------------------------------------------------------------- nominatim */

type NominatimReverse = {
  osm_type?: string;
  osm_id?: number;
  name?: string;
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: Record<string, string>;
};

/**
 * Best available name for a coordinate that matched no masjid.
 *
 * Prefers the specific thing standing at that point (a shop, a school, a named
 * building) over the street it sits on, and falls back to the neighbourhood.
 */
function labelFromReverse(result: NominatimReverse): string {
  const address = result.address ?? {};
  const specific =
    result.name ||
    address.amenity ||
    address.shop ||
    address.office ||
    address.building ||
    address.house_name ||
    address.school ||
    address.hospital;

  if (specific) return specific.slice(0, 200);

  const area =
    address.neighbourhood ||
    address.suburb ||
    address.village ||
    address.town ||
    address.city_district;
  const road = address.road;

  if (road && area) return `${road}, ${area}`.slice(0, 200);
  return (
    road ||
    area ||
    result.display_name?.split(",")[0] ||
    "Unknown place"
  ).slice(0, 200);
}

/**
 * Name a coordinate that is not a masjid, cached by an ~11 m grid cell.
 * Returns null when OSM is unreachable, so the caller can retry later.
 */
export async function reverseGeocode(point: LatLng): Promise<IMapPlace | null> {
  await connectDB();

  const cellKey = `geo:${geoCacheKey(point, 4)}`;
  const cached = await MapPlace.findOne({ key: cellKey }).lean();
  if (cached) return cached as IMapPlace;

  const url = new URL(NOMINATIM_REVERSE);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(point.lat));
  url.searchParams.set("lon", String(point.lng));
  // 18 = building level; anything finer returns noise for a GPS centroid.
  url.searchParams.set("zoom", "18");
  url.searchParams.set("addressdetails", "1");

  let result: NominatimReverse | null = null;
  try {
    const response = await throttled(() => fetchWithTimeout(url.toString()));
    if (!response.ok) return null;
    result = (await response.json()) as NominatimReverse;
  } catch {
    return null;
  }

  if (!result || (!result.display_name && !result.name)) return null;

  const address = result.address ?? {};
  const city = address.city || address.town;

  const doc = await MapPlace.findOneAndUpdate(
    { key: cellKey },
    {
      $set: {
        name: labelFromReverse(result),
        kind: "place",
        lat: Number(result.lat) || point.lat,
        lng: Number(result.lon) || point.lng,
        address: (result.display_name ?? "").slice(0, 400),
        osmType: result.osm_type ?? null,
        osmId: result.osm_id ?? null,
        source: "nominatim",
        tags: {
          ...(address.suburb ? { suburb: address.suburb.slice(0, 120) } : {}),
          ...(city ? { city: city.slice(0, 120) } : {}),
        },
        fetchedAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  return doc as IMapPlace | null;
}
