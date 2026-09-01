"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/client-api";
import { distanceMeters, type LatLng } from "@/lib/geo";

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
 * What it does *not* do is pretend to track in the background. The UI says so
 * plainly rather than quietly losing the walk home.
 */

export type TrackingState =
  | "idle"
  | "starting"
  | "tracking"
  | "denied"
  | "unsupported"
  | "error";

export type LivePosition = LatLng & {
  ts: number;
  accuracy: number | null;
  speed: number | null;
  altitude: number | null;
  heading: number | null;
};

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

/** A fix vaguer than this is a tower estimate; ignore it entirely. */
const MAX_ACCURACY_METERS = 120;

const FLUSH_INTERVAL_MS = 30_000;
const FLUSH_AT_POINTS = 25;

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
  const [position, setPosition] = useState<LivePosition | null>(null);
  const [queueSize, setQueueSize] = useState(0);
  const [stats, setStats] = useState<SessionStats>({
    distanceMeters: 0,
    recordedPoints: 0,
    startedAt: null,
    lastFixAt: null,
  });

  const watchIdRef = useRef<number | null>(null);
  const queueRef = useRef<QueuedFix[]>([]);
  const lastRecordedRef = useRef<LivePosition | null>(null);
  const flushingRef = useRef(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const onFlushedRef = useRef(onFlushed);
  const onErrorRef = useRef(onError);

  onFlushedRef.current = onFlushed;
  onErrorRef.current = onError;

  // Anything left over from a previous session goes out with the next flush.
  useEffect(() => {
    queueRef.current = readQueue();
    setQueueSize(queueRef.current.length);
  }, []);

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

  const stop = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    releaseWakeLock();
    setState("idle");
    void flush();
  }, [flush, releaseWakeLock]);

  const start = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setState("unsupported");
      return;
    }
    if (watchIdRef.current !== null) return;

    setState("starting");
    lastRecordedRef.current = null;
    setStats({
      distanceMeters: 0,
      recordedPoints: 0,
      startedAt: Date.now(),
      lastFixAt: null,
    });

    watchIdRef.current = navigator.geolocation.watchPosition(
      (reading) => {
        setState("tracking");

        const fix: LivePosition = {
          lat: reading.coords.latitude,
          lng: reading.coords.longitude,
          ts: reading.timestamp,
          accuracy: Number.isFinite(reading.coords.accuracy)
            ? reading.coords.accuracy
            : null,
          speed:
            reading.coords.speed != null && reading.coords.speed >= 0
              ? reading.coords.speed
              : null,
          altitude: reading.coords.altitude ?? null,
          heading:
            reading.coords.heading != null &&
            Number.isFinite(reading.coords.heading)
              ? reading.coords.heading
              : null,
        };

        setPosition(fix);

        if (fix.accuracy != null && fix.accuracy > MAX_ACCURACY_METERS) return;

        const previous = lastRecordedRef.current;
        const moved = previous ? distanceMeters(previous, fix) : Infinity;
        const elapsed = previous ? fix.ts - previous.ts : Infinity;

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
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setState("denied");
          if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
          }
          releaseWakeLock();
          return;
        }
        // A timeout or a temporary loss of signal is not the end of the watch.
        setState("tracking");
      },
      {
        enableHighAccuracy: highAccuracy,
        maximumAge: 5_000,
        timeout: 30_000,
      }
    );

    void acquireWakeLock();
  }, [acquireWakeLock, enqueue, highAccuracy, releaseWakeLock]);

  /* ------------------------------------------------------- flush lifecycle */

  useEffect(() => {
    if (state !== "tracking") return;
    const timer = window.setInterval(() => void flush(), FLUSH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [state, flush]);

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

  /** A screen wake lock is dropped when the tab is backgrounded — reclaim it. */
  useEffect(() => {
    if (state !== "tracking") return;
    const onVisible = () => {
      if (document.visibilityState === "visible" && !wakeLockRef.current) {
        void acquireWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [state, acquireWakeLock]);

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
    isTracking: state === "tracking" || state === "starting",
    start,
    stop,
    flush,
  };
}
