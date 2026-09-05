"use client";

/**
 * Browser geolocation, told straight.
 *
 * The Geolocation API fails in several distinct ways that all look identical to
 * a naive caller — and the two most common ones in this app are the two that
 * *cannot* be fixed by "allow location in your browser":
 *
 *   1. the page is not a secure context (plain `http://` on a LAN address,
 *      which is exactly how a phone reaches `next dev`), so every call is
 *      rejected before the user is ever prompted;
 *   2. the OS location service is off, so permission is granted and the browser
 *      still cannot produce a fix.
 *
 * Everything here exists so the UI can name which of those happened and say
 * what to do about it, per platform, instead of showing one generic "denied".
 *
 * No network, no keys, no third-party SDK — this is the platform API plus
 * honest error reporting.
 */

import type { LatLng } from "@/lib/geo";

export type GeoFix = LatLng & {
  ts: number;
  accuracy: number | null;
  speed: number | null;
  altitude: number | null;
  heading: number | null;
};

export type GeoFailureKind =
  | "denied"
  | "unavailable"
  | "timeout"
  | "insecure"
  | "unsupported"
  | "unknown";

export type GeoFailure = {
  kind: GeoFailureKind;
  /** One line naming what went wrong. */
  title: string;
  /** What the person can actually do about it, on their platform. */
  hint: string;
  /** True when retrying without changing a setting could still work. */
  retryable: boolean;
};

export type GeoPermission = "granted" | "denied" | "prompt" | "unknown";

/** Rejection carried out of every helper here, so callers see one shape. */
export class GeoError extends Error {
  failure: GeoFailure;
  constructor(failure: GeoFailure) {
    super(failure.title);
    this.name = "GeoError";
    this.failure = failure;
  }
}

/* --------------------------------------------------------------- platform */

type Platform = "ios" | "android" | "macos" | "windows" | "other";

function platform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; the touch count is what gives it away.
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Macintosh|Mac OS X/.test(ua)) return "macos";
  if (/Windows/i.test(ua)) return "windows";
  return "other";
}

/** "Allow this site" steps, which differ enough per platform to matter. */
function allowSiteHint(): string {
  switch (platform()) {
    case "ios":
      return "In Safari tap AA in the address bar, then Website Settings, then Location, then Allow, and reload. In Chrome use the three-dot menu, then Settings, then Site settings, then Location.";
    case "android":
      return "Tap the padlock (or the info icon) next to the address, then Permissions, then Location, then Allow, and reload the page.";
    case "macos":
      return "Click the padlock in the address bar, then Location, then Allow, and reload the page.";
    default:
      return "Click the padlock (or the crossed-out location pin) in the address bar, then Location, then Allow, and reload the page.";
  }
}

/** "The OS itself has location switched off" steps. */
function systemLocationHint(): string {
  switch (platform()) {
    case "ios":
      return "Open Settings, then Privacy & Security, then Location Services. Turn it on and make sure your browser is allowed While Using the App.";
    case "android":
      return "Swipe down and turn on Location, then check Settings, then Location, then Location services, and confirm Google Location Accuracy is on.";
    case "macos":
      return "Open System Settings, then Privacy & Security, then Location Services, and enable it for your browser.";
    case "windows":
      return "Open Windows Settings, then Privacy & security, then Location, and turn on both Location services and Let apps access your location.";
    default:
      return "Turn on the location service in your device settings, then try again.";
  }
}

const INSECURE_HINT =
  "Geolocation is only allowed on a secure page. Open this site over https://, or over http://localhost on the same machine. To test on a phone against the dev server, run npm run dev:https and use the https:// address it prints.";

/* ----------------------------------------------------------- availability */

export type GeoAvailability = { ok: true } | { ok: false; failure: GeoFailure };

const UNSUPPORTED: GeoFailure = {
  kind: "unsupported",
  title: "This browser has no Geolocation API",
  hint: "Open the site in Chrome, Safari, Firefox or Edge — location is not available in this browser.",
  retryable: false,
};

const INSECURE: GeoFailure = {
  kind: "insecure",
  title: "This page is not served over HTTPS",
  hint: INSECURE_HINT,
  retryable: false,
};

/**
 * Whether a position can be asked for at all.
 *
 * `isSecureContext` is the check that matters most here: on a plain-http LAN
 * address the API object still exists, so a feature test alone passes and the
 * request then fails as though the user had refused it.
 */
export function checkGeolocation(): GeoAvailability {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { ok: false, failure: UNSUPPORTED };
  }
  if (!("geolocation" in navigator) || !navigator.geolocation) {
    return { ok: false, failure: UNSUPPORTED };
  }
  if (window.isSecureContext === false) {
    return { ok: false, failure: INSECURE };
  }
  return { ok: true };
}

/* ------------------------------------------------------------- permission */

function permissionsApi(): Permissions | null {
  if (typeof navigator === "undefined") return null;
  return navigator.permissions ?? null;
}

/**
 * Current permission, where the browser will say.
 *
 * Safari implements `navigator.permissions` but has historically thrown for the
 * `geolocation` name, so a failure here means "unknown", never "denied".
 */
export async function readGeolocationPermission(): Promise<GeoPermission> {
  const permissions = permissionsApi();
  if (!permissions?.query) return "unknown";
  try {
    const status = await permissions.query({ name: "geolocation" });
    return status.state as GeoPermission;
  } catch {
    return "unknown";
  }
}

/**
 * Watch the permission and report changes.
 *
 * This is what lets the app recover on its own: the user leaves the tab open,
 * flips the switch in the browser's site settings, and tracking resumes without
 * anyone having to know a reload was needed.
 */
export function watchGeolocationPermission(
  onChange: (state: GeoPermission) => void
): () => void {
  const permissions = permissionsApi();
  if (!permissions?.query) return () => {};

  let status: PermissionStatus | null = null;
  let cancelled = false;
  const handler = () => {
    if (status && !cancelled) onChange(status.state as GeoPermission);
  };

  void permissions
    .query({ name: "geolocation" })
    .then((result) => {
      if (cancelled) return;
      status = result;
      result.addEventListener("change", handler);
      onChange(result.state as GeoPermission);
    })
    .catch(() => {
      /* Safari and friends: no observable permission; the UI copes without it */
    });

  return () => {
    cancelled = true;
    status?.removeEventListener("change", handler);
  };
}

/* ----------------------------------------------------------------- errors */

function isPositionError(value: unknown): value is GeolocationPositionError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as GeolocationPositionError).code === "number"
  );
}

/**
 * Turn anything a geolocation call can throw into one actionable description.
 *
 * A request on an insecure origin is reported as `PERMISSION_DENIED` by Chrome
 * even though the user was never asked, so the secure-context check comes first
 * — otherwise the app tells people to change a browser setting that is not the
 * problem.
 */
export function describeGeolocationError(error: unknown): GeoFailure {
  if (error instanceof GeoError) return error.failure;

  const availability = checkGeolocation();
  if (!availability.ok) return availability.failure;

  if (isPositionError(error)) {
    switch (error.code) {
      case 1:
        return {
          kind: "denied",
          title: "Location is blocked for this site",
          hint: allowSiteHint(),
          retryable: true,
        };
      case 2:
        return {
          kind: "unavailable",
          title: "Your device could not work out where it is",
          hint: systemLocationHint(),
          retryable: true,
        };
      case 3:
        return {
          kind: "timeout",
          title: "No position fix yet",
          hint: "A first GPS fix can take up to a minute outdoors, and may never arrive deep indoors. Move near a window or step outside, then try again.",
          retryable: true,
        };
      default:
        break;
    }
  }

  return {
    kind: "unknown",
    title: "Location request failed",
    hint: "Something went wrong reading your position. Try again in a moment.",
    retryable: true,
  };
}

/* ------------------------------------------------------------------ fixes */

export function normalizeFix(reading: GeolocationPosition): GeoFix {
  const coords = reading.coords;
  return {
    lat: coords.latitude,
    lng: coords.longitude,
    ts: reading.timestamp || Date.now(),
    accuracy: Number.isFinite(coords.accuracy) ? coords.accuracy : null,
    // The API reports -1 for "speed unknown", not a real standstill.
    speed: coords.speed != null && coords.speed >= 0 ? coords.speed : null,
    altitude:
      coords.altitude != null && Number.isFinite(coords.altitude)
        ? coords.altitude
        : null,
    heading:
      coords.heading != null && Number.isFinite(coords.heading)
        ? coords.heading
        : null,
  };
}

/**
 * A single position, as a promise.
 *
 * The extra watchdog is not belt and braces: on Android Chrome a wedged
 * location provider can leave `getCurrentPosition` without ever calling either
 * callback, and a UI waiting on that spins forever. The watchdog turns the hang
 * into an ordinary timeout the caller can report and retry.
 */
export function getCurrentFix(options: PositionOptions = {}): Promise<GeoFix> {
  const availability = checkGeolocation();
  if (!availability.ok) {
    return Promise.reject(new GeoError(availability.failure));
  }

  const timeout = options.timeout ?? 15_000;

  return new Promise<GeoFix>((resolve, reject) => {
    let settled = false;

    const watchdog = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(
        new GeoError({
          kind: "timeout",
          title: "No position fix yet",
          hint: "Your device did not answer the location request. Check that GPS is on, then try again.",
          retryable: true,
        })
      );
    }, timeout + 2_000);

    navigator.geolocation.getCurrentPosition(
      (reading) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(watchdog);
        resolve(normalizeFix(reading));
      },
      (error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(watchdog);
        reject(new GeoError(describeGeolocationError(error)));
      },
      { enableHighAccuracy: false, maximumAge: 30_000, ...options, timeout }
    );
  });
}

/**
 * How good a fix is, in words.
 *
 * Worth showing because the number alone does not tell a user that ±1200 m is a
 * Wi-Fi/IP estimate rather than a GPS reading — which is the single most
 * confusing thing about running this on a desktop.
 */
export function describeAccuracy(accuracy: number | null): {
  label: string;
  coarse: boolean;
} {
  if (accuracy == null) return { label: "Unknown accuracy", coarse: true };
  if (accuracy <= 25) return { label: "GPS accuracy", coarse: false };
  if (accuracy <= 120) return { label: "Good accuracy", coarse: false };
  if (accuracy <= 500) return { label: "Rough accuracy", coarse: true };
  return { label: "Network estimate only", coarse: true };
}
