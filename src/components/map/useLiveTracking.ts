"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/client-api";
import { distanceMeters } from "@/lib/geo";
import {
  checkGeolocation,
  describeGeolocationError,
  getCurrentFix,
  normalizeFix,
  readGeolocationPermission,
  watchGeolocationPermission,
  type GeoFailure,
  type GeoFix,
  type GeoPermission,
} from "@/lib/geolocation";

/**
 * Live GPS capture for the journey map.
 *
 * Everything here is shaped by one hard constraint: **a web app only receives
 * positions while one of its pages is alive**. There is no background
 * geolocation for a PWA on either iOS or Android, so this hook optimises for
 * the session it can actually observe — it keeps the screen awake where the
 * browser allows it, survives a tunnel by queueing to `localStorage`, and
 * flushes whatever it holds the moment the page is hidden.
 *
 * What it does *not* do is pretend. Earlier versions reported every non-denial
 * error as "tracking", so a phone with its location service switched off showed
 * a happy green "Recording your journey" and silently recorded nothing. Each
 * failure mode now has its own state and its own explanation, and the watch is
 * rebuilt — at coarse accuracy if that is what it takes — rather than left
 * wedged.
 */

export type TrackingState =
  /** Nothing running. */
  | "idle"
  /** Watch registered, waiting for the first fix. */
  | "starting"
  /** Fixes arriving. */
  | "tracking"
  /** Was tracking, has since gone quiet — tunnel, lift, backgrounded tab. */
  | "searching"
  /** Permission refused by the user or the browser. */
  | "denied"
  /** Page is not a secure context; the API cannot be used at all. */
  | "insecure"
  /** No Geolocation API in this browser. */
  | "unsupported"
  /** Permission is fine but the device cannot produce a fix. */
  | "unavailable";

export type LivePosition = GeoFix;

export type QueuedFix = {
  ts: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  altitude: number | null;
  heading: number | null;
};

export type SessionStats = {
  /** Metres covered since the switch was flipped on. */
  distanceMeters: number;
  recordedPoints: number;
  startedAt: number | null;
  lastFixAt: number | null;
};

const QUEUE_KEY = "trackdash.trackQueue";

/** Below this, a new fix is the same spot seen again — not worth a row. */
const MIN_MOVE_METERS = 15;

/** …but record a heartbeat anyway, so a long stay has a duration to measure. */
const HEARTBEAT_MS = 90_000;

/**
 * Accuracy budget.
 *
 * `GOOD` is a real GPS-grade fix and is recorded as-is. Between `GOOD` and
 * `LIMIT` a fix is only recorded when the distance moved is larger than the
 * fix's own error — a 300 m jump reported at ±200 m is movement; a 40 m jump
 * reported at ±200 m is noise. Anything past `LIMIT` is a cell-tower or IP
 * estimate and is never written, whatever it claims.
 */
const ACCURACY_GOOD_M = 120;
const ACCURACY_LIMIT_M = 500;

const FLUSH_INTERVAL_MS = 30_000;
const FLUSH_AT_POINTS = 25;

/** Silence longer than this means the watch has stopped producing. */
const STALE_FIX_MS = 75_000;

/** How long a backgrounded tab may be away before the watch is rebuilt. */
const RESUME_AFTER_MS = 30_000;

/** Consecutive failures before dropping from GPS to network positioning. */
const DEGRADE_AFTER_FAILURES = 2;

/** Keep the offline queue bounded — a very long tunnel should not fill storage. */
const MAX_QUEUE = 2000;

function readQueue(): QueuedFix[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedFix[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedFix[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      QUEUE_KEY,
      JSON.stringify(queue.slice(-MAX_QUEUE))
    );
  } catch {
    /* storage full or blocked — the in-memory buffer still works */
  }
}

export type UseLiveTrackingOptions = {
  highAccuracy: boolean;
  /** Called after a successful flush, so the page can refresh its day view. */
  onFlushed?: (accepted: number) => void;
  onError?: (message: string) => void;
};

export function useLiveTracking({
  highAccuracy,
  onFlushed,
  onError,
}: UseLiveTrackingOptions) {
  const [state, setState] = useState<TrackingState>("idle");
  /** The user's intent: true from the moment the switch is flipped on. */
  const [active, setActive] = useState(false);
  const [position, setPosition] = useState<LivePosition | null>(null);
  const [failure, setFailure] = useState<GeoFailure | null>(null);
  const [permission, setPermission] = useState<GeoPermission>("unknown");
  const [coarseOnly, setCoarseOnly] = useState(false);
  const [droppedForAccuracy, setDroppedForAccuracy] = useState(0);
  const [locating, setLocating] = useState(false);
  const [queueSize, setQueueSize] = useState(0);
  const [stats, setStats] = useState<SessionStats>({
    distanceMeters: 0,
    recordedPoints: 0,
    startedAt: null,
    lastFixAt: null,
  });

  const watchIdRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  const queueRef = useRef<QueuedFix[]>([]);
  const lastRecordedRef = useRef<LivePosition | null>(null);
  const lastFixAtRef = useRef<number>(0);
  const failuresRef = useRef(0);
  const highAccuracyRef = useRef(highAccuracy);
  const usingHighAccuracyRef = useRef(highAccuracy);
  const flushingRef = useRef(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const onFlushedRef = useRef(onFlushed);
  const onErrorRef = useRef(onError);

  onFlushedRef.current = onFlushed;
  onErrorRef.current = onError;
  highAccuracyRef.current = highAccuracy;

  // Anything left over from a previous session goes out with the next flush.
  useEffect(() => {
    queueRef.current = readQueue();
    setQueueSize(queueRef.current.length);
  }, []);

  /* --------------------------------------------------------- permission */

  useEffect(() => {
    void readGeolocationPermission().then(setPermission);
    return watchGeolocationPermission((next) => {
      setPermission(next);
      // Granted from the browser's own settings while the page sat open —
      // clear the stale refusal so the switch is usable again immediately.
      if (next === "granted") {
        setFailure((current) => (current?.kind === "denied" ? null : current));
        setState((current) => (current === "denied" ? "idle" : current));
      }
      if (next === "denied" && activeRef.current) {
        setFailure(describeGeolocationError({ code: 1 }));
        setState("denied");
      }
    });
  }, []);

  /* -------------------------------------------------------------- flush */

  const flush = useCallback(async () => {
    if (flushingRef.current || queueRef.current.length === 0) return;
    flushingRef.current = true;

    const batch = queueRef.current.slice(0, 500);
    try {
      const result = await api<{ accepted: number }>("/api/track/points", {
        method: "POST",
        body: JSON.stringify({ points: batch }),
        keepalive: batch.length <= 60,
      });

      queueRef.current = queueRef.current.slice(batch.length);
      writeQueue(queueRef.current);
      setQueueSize(queueRef.current.length);
      onFlushedRef.current?.(result.accepted);
    } catch (error) {
      /**
       * A rejected batch is a permanent no — tracking was turned off, or the
       * fixes are too old to accept. Retrying it forever would wedge the queue
       * behind data the server will never take.
       */
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
        queueRef.current = queueRef.current.slice(batch.length);
        writeQueue(queueRef.current);
        setQueueSize(queueRef.current.length);
        if (error.status === 403) {
          onErrorRef.current?.(error.message);
        }
      }
      // 5xx or offline: keep the batch and try again on the next tick.
    } finally {
      flushingRef.current = false;
    }
  }, []);

  const enqueue = useCallback(
    (fix: LivePosition) => {
      queueRef.current.push({
        ts: new Date(fix.ts).toISOString(),
        lat: fix.lat,
        lng: fix.lng,
        accuracy: fix.accuracy,
        speed: fix.speed,
        altitude: fix.altitude,
        heading: fix.heading,
      });
      writeQueue(queueRef.current);
      setQueueSize(queueRef.current.length);
      if (queueRef.current.length >= FLUSH_AT_POINTS) void flush();
    },
    [flush]
  );

  /* ----------------------------------------------------------- wake lock */

  /**
   * Keep the screen on while tracking. A locked phone stops delivering
   * positions, so without this a walk to the masjid records its first minute
   * and nothing else. Unsupported on some browsers; failure is not fatal.
   */
  const acquireWakeLock = useCallback(async () => {
    try {
      if (!("wakeLock" in navigator)) return;
      wakeLockRef.current = await navigator.wakeLock.request("screen");
    } catch {
      /* denied or unsupported — tracking still works while the page is visible */
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    void wakeLockRef.current?.release().catch(() => undefined);
    wakeLockRef.current = null;
  }, []);

  /* --------------------------------------------------------------- watch */

  const clearWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  /** Fold one reading into the map, the session stats and the upload queue. */
  const acceptFix = useCallback(
    (fix: LivePosition) => {
      lastFixAtRef.current = Date.now();
      failuresRef.current = 0;
      setPosition(fix);
      setFailure(null);
      if (activeRef.current) setState("tracking");

      if (!activeRef.current) return;

      const accuracy = fix.accuracy ?? ACCURACY_GOOD_M;
      const previous = lastRecordedRef.current;
      const moved = previous ? distanceMeters(previous, fix) : Infinity;
      const elapsed = previous ? fix.ts - previous.ts : Infinity;

      /**
       * A journey must not be anchored on a guess, so the first point of a
       * session has to be GPS-grade. After that a rougher fix still counts,
       * but only when the movement it reports is larger than its own error.
       */
      const trustworthy =
        accuracy <= ACCURACY_GOOD_M ||
        (previous !== null && accuracy <= ACCURACY_LIMIT_M && moved > accuracy);

      if (!trustworthy) {
        setDroppedForAccuracy((count) => count + 1);
        return;
      }

      // Record real movement, or a heartbeat so standing still has a duration.
      if (moved < MIN_MOVE_METERS && elapsed < HEARTBEAT_MS) return;

      lastRecordedRef.current = fix;
      enqueue(fix);

      setStats((current) => ({
        distanceMeters:
          current.distanceMeters +
          (previous && Number.isFinite(moved) && moved < 5000 ? moved : 0),
        recordedPoints: current.recordedPoints + 1,
        startedAt: current.startedAt ?? fix.ts,
        lastFixAt: fix.ts,
      }));
    },
    [enqueue]
  );

  /**
   * (Re)register the position watch.
   *
   * `preferHighAccuracy` is a preference, not a promise: after repeated
   * failures the watch is rebuilt with it off, because a device that cannot get
   * a GPS lock indoors can usually still place itself by Wi-Fi, and a rough
   * position on the map beats a spinner.
   */
  const registerWatchRef = useRef<(preferHighAccuracy: boolean) => void>(
    () => {}
  );

  const registerWatch = useCallback(
    (preferHighAccuracy: boolean): void => {
      clearWatch();
      usingHighAccuracyRef.current = preferHighAccuracy;
      // Only a *forced* downgrade is worth reporting; asking for battery-saving
      // positioning in Settings is a choice, not a fault.
      setCoarseOnly(highAccuracyRef.current && !preferHighAccuracy);

      watchIdRef.current = navigator.geolocation.watchPosition(
        (reading) => acceptFix(normalizeFix(reading)),
        (error) => {
          const described = describeGeolocationError(error);

          if (described.kind === "denied" || described.kind === "insecure") {
            clearWatch();
            releaseWakeLock();
            activeRef.current = false;
            setActive(false);
            setFailure(described);
            setState(described.kind === "insecure" ? "insecure" : "denied");
            return;
          }

          failuresRef.current += 1;
          setFailure(described);

          /**
           * Two failures in a row on GPS: fall back to network positioning
           * rather than sit on a watch that has already shown it cannot
           * deliver. One rebuild only — `usingHighAccuracyRef` stops it looping.
           */
          if (
            failuresRef.current >= DEGRADE_AFTER_FAILURES &&
            usingHighAccuracyRef.current
          ) {
            failuresRef.current = 0;
            registerWatchRef.current(false);
            return;
          }

          setState((current) => {
            if (!activeRef.current) return current;
            if (described.kind === "unavailable" && lastFixAtRef.current === 0) {
              return "unavailable";
            }
            return lastFixAtRef.current > 0 ? "searching" : "starting";
          });
        },
        {
          enableHighAccuracy: preferHighAccuracy,
          // A coarse watch may reuse a recent cached fix; a GPS watch must not.
          maximumAge: preferHighAccuracy ? 5_000 : 60_000,
          timeout: preferHighAccuracy ? 30_000 : 60_000,
        }
      );
    },
    [acceptFix, clearWatch, releaseWakeLock]
  );

  registerWatchRef.current = registerWatch;

  /* --------------------------------------------------------- start / stop */

  const stop = useCallback(() => {
    activeRef.current = false;
    setActive(false);
    clearWatch();
    releaseWakeLock();
    setState("idle");
    void flush();
  }, [clearWatch, flush, releaseWakeLock]);

  const start = useCallback(() => {
    const availability = checkGeolocation();
    if (!availability.ok) {
      setFailure(availability.failure);
      setState(
        availability.failure.kind === "insecure" ? "insecure" : "unsupported"
      );
      return;
    }
    if (activeRef.current) return;

    activeRef.current = true;
    setActive(true);
    setState("starting");
    setFailure(null);
    setDroppedForAccuracy(0);
    failuresRef.current = 0;
    lastFixAtRef.current = 0;
    lastRecordedRef.current = null;
    setStats({
      distanceMeters: 0,
      recordedPoints: 0,
      startedAt: Date.now(),
      lastFixAt: null,
    });

    /**
     * Ask for a cached coarse position first. On a phone this usually answers
     * in well under a second from the last app that asked, so the map lands on
     * the user immediately instead of showing an empty grid while the GPS chip
     * spends thirty seconds finding satellites.
     */
    void getCurrentFix({
      enableHighAccuracy: false,
      maximumAge: 600_000,
      timeout: 8_000,
    })
      .then((fix) => {
        if (!activeRef.current) return;
        // Display only: the warm fix is usually too rough to store, and
        // `acceptFix` applies the accuracy rules to it like any other.
        acceptFix(fix);
      })
      .catch(() => {
        /* the real watch below is the one that matters */
      });

    registerWatch(highAccuracyRef.current);
    void acquireWakeLock();
  }, [acceptFix, acquireWakeLock, registerWatch]);

  /** Rebuild the watch after the user fixes whatever the banner complained about. */
  const retry = useCallback(() => {
    const availability = checkGeolocation();
    if (!availability.ok) {
      setFailure(availability.failure);
      setState(
        availability.failure.kind === "insecure" ? "insecure" : "unsupported"
      );
      return;
    }
    setFailure(null);
    failuresRef.current = 0;
    if (!activeRef.current) {
      start();
      return;
    }
    setState(lastFixAtRef.current > 0 ? "searching" : "starting");
    registerWatch(highAccuracyRef.current);
  }, [registerWatch, start]);

  /**
   * One position, without starting a recording session.
   *
   * This is the "where am I" the map needs before anything is being tracked —
   * centring the view, or giving "masjids near me" a coordinate to search
   * around. It never writes a point.
   */
  const locateOnce = useCallback(async (): Promise<LivePosition | null> => {
    const availability = checkGeolocation();
    if (!availability.ok) {
      setFailure(availability.failure);
      setState(
        availability.failure.kind === "insecure" ? "insecure" : "unsupported"
      );
      return null;
    }

    setLocating(true);
    try {
      // Try for a real fix, then settle for a cached coarse one.
      let fix: LivePosition;
      try {
        fix = await getCurrentFix({
          enableHighAccuracy: true,
          maximumAge: 15_000,
          timeout: 20_000,
        });
      } catch (error) {
        const described = describeGeolocationError(error);
        if (described.kind === "denied" || described.kind === "insecure") throw error;
        fix = await getCurrentFix({
          enableHighAccuracy: false,
          maximumAge: 300_000,
          timeout: 15_000,
        });
      }

      lastFixAtRef.current = Date.now();
      setPosition(fix);
      setFailure(null);
      if (!activeRef.current) {
        setState((current) =>
          current === "denied" || current === "unavailable" ? "idle" : current
        );
      }
      return fix;
    } catch (error) {
      const described = describeGeolocationError(error);
      setFailure(described);
      if (described.kind === "denied") setState("denied");
      else if (described.kind === "insecure") setState("insecure");
      else if (described.kind === "unsupported") setState("unsupported");
      else if (!activeRef.current) setState("unavailable");
      return null;
    } finally {
      setLocating(false);
    }
  }, []);

  /* ------------------------------------------------------- flush lifecycle */

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => void flush(), FLUSH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [active, flush]);

  useEffect(() => {
    const onHide = () => {
      // Last chance before the tab is frozen or discarded.
      if (document.visibilityState === "hidden") void flush();
    };
    const onPageHide = () => void flush();
    const onOnline = () => void flush();

    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("online", onOnline);

    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("online", onOnline);
    };
  }, [flush]);

  /* --------------------------------------------------------- watch health */

  /**
   * A watch that has gone quiet is not the same as one that has failed, and no
   * error is fired for it — iOS in particular simply stops delivering. Say so,
   * rather than leaving a stale "±8 m" on screen as if it were current.
   */
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      if (lastFixAtRef.current === 0) return;
      if (Date.now() - lastFixAtRef.current > STALE_FIX_MS) {
        setState((current) => (current === "tracking" ? "searching" : current));
      }
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [active]);

  /**
   * Coming back to a backgrounded tab.
   *
   * Both the screen wake lock and — on iOS — the position watch itself are
   * dropped while the tab is hidden, and neither comes back on its own. Reclaim
   * the lock, and rebuild the watch if it has clearly stopped producing.
   */
  useEffect(() => {
    if (!active) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (!wakeLockRef.current) void acquireWakeLock();
      const quietFor = Date.now() - lastFixAtRef.current;
      if (lastFixAtRef.current === 0 || quietFor > RESUME_AFTER_MS) {
        registerWatch(usingHighAccuracyRef.current);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [active, acquireWakeLock, registerWatch]);

  /** The accuracy preference is a property of the watch, so changing it rebuilds. */
  useEffect(() => {
    if (!activeRef.current) return;
    if (usingHighAccuracyRef.current === highAccuracy) return;
    failuresRef.current = 0;
    registerWatch(highAccuracy);
  }, [highAccuracy, registerWatch]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      void wakeLockRef.current?.release().catch(() => undefined);
    };
  }, []);

  return {
    state,
    position,
    stats,
    queueSize,
    failure,
    permission,
    coarseOnly,
    droppedForAccuracy,
    locating,
    /** True from the moment the switch is on, whatever the watch is doing. */
    isTracking: active,
    hasFix: position !== null,
    start,
    stop,
    retry,
    locateOnce,
    flush,
  };
}
