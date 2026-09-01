"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Compass,
  Crosshair,
  Gauge,
  Loader2,
  MapPin,
  MoonStar,
  Navigation,
  Radio,
  RefreshCw,
  Route,
  ShieldCheck,
  Timer,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import toast from "react-hot-toast";
import { api, ApiError } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { StatTile, EmptyState, SectionCard } from "@/components/dashboard/insight-widgets";
import { MapCanvas } from "@/components/map/MapCanvas";
import type { MapMarker } from "@/components/map/TrackMap";
import { useLiveTracking } from "@/components/map/useLiveTracking";
import { formatClock, KindBadge } from "@/components/map/map-shared";
import { compassPoint, formatDistance, formatDuration, qiblaBearing } from "@/lib/geo";
import type {
  TrackDayResponse,
  TrackNearbyResponse,
  TrackSettingsResponse,
  TrackingSettings,
} from "@/types";

/** How often the day view is refreshed while a session is running. */
const DAY_REFRESH_MS = 60_000;

export function MapLiveTab({
  settings,
  onSettingsChanged,
  onChanged,
}: {
  settings: TrackingSettings | null;
  onSettingsChanged: (next: TrackSettingsResponse) => void;
  onChanged?: () => void;
}) {
  const [day, setDay] = useState<TrackDayResponse | null>(null);
  const [loadingDay, setLoadingDay] = useState(true);
  const [nearby, setNearby] = useState<TrackNearbyResponse | null>(null);
  const [loadingNearby, setLoadingNearby] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [followMe, setFollowMe] = useState(true);
  const autoStartedRef = useRef(false);

  const loadDay = useCallback(async () => {
    try {
      setDay(await api<TrackDayResponse>("/api/track/day"));
    } catch (error) {
      if (error instanceof ApiError && error.status !== 401) {
        toast.error(error.message);
      }
    } finally {
      setLoadingDay(false);
    }
  }, []);

  useEffect(() => {
    void loadDay();
  }, [loadDay]);

  const tracking = useLiveTracking({
    highAccuracy: settings?.highAccuracy ?? true,
    onFlushed: () => {
      void loadDay();
      onChanged?.();
    },
    onError: (message) => toast.error(message),
  });

  const { start, stop, isTracking, state, position, stats, queueSize } = tracking;

  /** Resume automatically when the account asked for that. */
  useEffect(() => {
    if (!settings?.enabled || !settings.autoStart) return;
    if (autoStartedRef.current || isTracking) return;
    autoStartedRef.current = true;
    start();
  }, [settings?.enabled, settings?.autoStart, isTracking, start]);

  useEffect(() => {
    if (!isTracking) return;
    const timer = window.setInterval(() => void loadDay(), DAY_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [isTracking, loadDay]);

  /** Naming runs behind the UI, so a fresh stay gets a label without a wait. */
  useEffect(() => {
    const unresolved = day?.visits.some((visit) => visit.pendingLookup);
    if (!unresolved) return;
    const timer = window.setTimeout(async () => {
      try {
        const result = await api<{ resolved: number }>("/api/track/resolve", {
          method: "POST",
        });
        if (result.resolved > 0) void loadDay();
      } catch {
        /* OSM unreachable — the next pass will pick it up */
      }
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [day?.visits, loadDay]);

  async function setEnabled(enabled: boolean) {
    setEnabling(true);
    try {
      const next = await api<TrackSettingsResponse>("/api/track/settings", {
        method: "PUT",
        body: JSON.stringify({ enabled }),
      });
      onSettingsChanged(next);
      if (!enabled) stop();
      toast.success(enabled ? "Location tracking is on" : "Tracking turned off");
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not update tracking"
      );
    } finally {
      setEnabling(false);
    }
  }

  const findNearby = useCallback(async () => {
    if (!position) {
      toast.error("Waiting for a position fix first.");
      return;
    }
    setLoadingNearby(true);
    try {
      const params = new URLSearchParams({
        lat: String(position.lat),
        lng: String(position.lng),
        radius: "1500",
      });
      const result = await api<TrackNearbyResponse>(
        `/api/track/nearby?${params}`
      );
      setNearby(result);
      toast.success(
        result.count > 0
          ? `${result.count} masjid${result.count === 1 ? "" : "s"} within 1.5 km`
          : "No mapped masjid within 1.5 km"
      );
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Lookup failed"
      );
    } finally {
      setLoadingNearby(false);
    }
  }, [position]);

  /* ------------------------------------------------------------ map data */

  const markers = useMemo<MapMarker[]>(() => {
    const list: MapMarker[] = [];

    for (const visit of day?.visits ?? []) {
      list.push({
        id: `visit-${visit.id}`,
        lat: visit.lat,
        lng: visit.lng,
        kind: visit.isMasjid ? "masjid" : "place",
        label: visit.name,
        sublabel: `${formatClock(visit.startedAt)} – ${formatClock(
          visit.endedAt
        )} · ${formatDuration(visit.durationMinutes)}`,
      });
    }

    for (const masjid of nearby?.masjids ?? []) {
      // Skip one already shown as a visit at the same spot.
      const already = list.some(
        (marker) =>
          Math.abs(marker.lat - masjid.lat) < 0.0005 &&
          Math.abs(marker.lng - masjid.lng) < 0.0005
      );
      if (already) continue;
      list.push({
        id: `nearby-${masjid.id}`,
        lat: masjid.lat,
        lng: masjid.lng,
        kind: "masjid",
        label: masjid.name,
        sublabel: `${formatDistance(masjid.distanceMeters)} · ~${masjid.walkMinutes} min walk`,
      });
    }

    if (position) {
      list.push({
        id: "current",
        lat: position.lat,
        lng: position.lng,
        kind: "current",
        label: "You are here",
        sublabel: position.accuracy
          ? `±${Math.round(position.accuracy)} m`
          : undefined,
      });
    }

    return list;
  }, [day?.visits, nearby?.masjids, position]);

  const paths = useMemo(() => {
    const points = day?.path ?? [];
    if (points.length < 2) return [];
    return [
      {
        id: "today",
        points: points.map((point) => ({ lat: point.lat, lng: point.lng })),
        color: "#0d9488",
        width: 4,
      },
    ];
  }, [day?.path]);

  const qibla = position
    ? { ...position, bearing: qiblaBearing(position) }
    : null;

  /* -------------------------------------------------------------- opt-in */

  if (settings && !settings.enabled) {
    return (
      <div className="space-y-5">
        <SectionCard
          title="Location tracking is off"
          description="Nothing about your movements is recorded until you turn this on."
        >
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Explainer
                icon={Route}
                title="Your journeys"
                body="Where you went, how far, and how long each stop lasted."
              />
              <Explainer
                icon={MoonStar}
                title="Masjid visits"
                body="Which masjid, how many visits, and how long you stayed each time."
              />
              <Explainer
                icon={ShieldCheck}
                title="Yours alone"
                body="Stored against your account only, and erasable in one click from Settings."
              />
            </div>

            <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              Positions are read from your device only while this page is open.
              Place names come from OpenStreetMap, looked up by the server — your
              coordinates are never sent to an advertising or analytics service.
            </div>

            <Button
              type="button"
              loading={enabling}
              onClick={() => void setEnabled(true)}
              className="w-full sm:w-auto"
            >
              <ShieldCheck className="h-4 w-4" />
              Turn on tracking
            </Button>
          </div>
        </SectionCard>
      </div>
    );
  }

  const summary = day?.summary;
  const masjidVisitsToday =
    day?.visits.filter((visit) => visit.isMasjid).length ?? 0;

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------ control bar */}
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-4 border-b border-border bg-gradient-to-br from-teal-500/10 via-card to-card px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                isTracking
                  ? "bg-teal-500/15 text-teal-800 dark:text-teal-300"
                  : "bg-muted text-muted-foreground"
              )}
            >
              <Radio
                className={cn("h-5 w-5", isTracking && "animate-slow-pulse")}
              />
            </span>
            <div className="min-w-0">
              <p className="text-base font-bold tracking-tight">
                {isTracking ? "Recording your journey" : "Tracking paused"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                <StatusLine
                  state={state}
                  accuracy={position?.accuracy ?? null}
                  queueSize={queueSize}
                />
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {isTracking ? "On" : "Off"}
            </span>
            <Switch
              checked={isTracking}
              onCheckedChange={(next) => (next ? start() : stop())}
              aria-label="Live tracking"
            />
          </div>
        </div>

        {state === "denied" ? (
          <div className="flex items-start gap-2 border-b border-border bg-rose-500/10 px-4 py-3 text-xs text-rose-900 dark:text-rose-200 sm:px-5">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Your browser is blocking location for this site. Allow it in the
              address-bar site settings, then flip the switch again.
            </span>
          </div>
        ) : null}

        {isTracking ? (
          <div className="grid grid-cols-2 divide-x divide-border border-b border-border sm:grid-cols-4">
            <MiniStat
              label="This session"
              value={formatDistance(stats.distanceMeters)}
            />
            <MiniStat label="Fixes kept" value={String(stats.recordedPoints)} />
            <MiniStat
              label="Accuracy"
              value={position?.accuracy ? `±${Math.round(position.accuracy)} m` : "—"}
            />
            <MiniStat
              label="Last fix"
              value={
                stats.lastFixAt
                  ? formatClock(new Date(stats.lastFixAt).toISOString())
                  : "—"
              }
            />
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void findNearby()}
            loading={loadingNearby}
            disabled={!position}
          >
            {!loadingNearby ? <MoonStar className="h-4 w-4" /> : null}
            Masjids near me
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadDay()}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button
            type="button"
            variant={followMe ? "default" : "outline"}
            size="sm"
            onClick={() => setFollowMe((value) => !value)}
            disabled={!position}
          >
            <Crosshair className="h-4 w-4" />
            {followMe ? "Following you" : "Follow me"}
          </Button>
          <span className="ml-auto text-[11px] text-muted-foreground">
            Positions are read only while this page is open.
          </span>
        </div>
      </section>

      {/* ------------------------------------------------------------- map */}
      <MapCanvas
        markers={markers}
        paths={paths}
        accuracy={
          position && position.accuracy
            ? { ...position, radius: position.accuracy }
            : null
        }
        qibla={qibla}
        center={followMe && position ? position : null}
        zoom={followMe && position ? 16 : undefined}
        fitKey={
          !followMe && paths.length > 0 ? `today-${day?.path.length}` : undefined
        }
        height={440}
        emptyHint={
          isTracking
            ? "Waiting for your first fix…"
            : "Turn tracking on to draw today's route"
        }
        toolbar={
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            Today · {day?.visits.length ?? 0} stop
            {(day?.visits.length ?? 0) === 1 ? "" : "s"}
          </span>
        }
      />

      {/* ---------------------------------------------------- today's stats */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Distance today"
          value={formatDistance(summary?.distanceMeters ?? 0)}
          sub={`${summary?.pointCount ?? 0} fixes recorded`}
          icon={Route}
          accent="teal"
        />
        <StatTile
          label="Time moving"
          value={formatDuration(summary?.movingMinutes ?? 0)}
          sub={`Avg ${summary?.averageSpeedKmh ?? 0} km/h`}
          icon={Timer}
          accent="blue"
        />
        <StatTile
          label="Stops today"
          value={day?.visits.length ?? 0}
          sub={`${formatDuration(summary?.stationaryMinutes ?? 0)} standing still`}
          icon={MapPin}
          accent="indigo"
        />
        <StatTile
          label="Masjid visits"
          value={masjidVisitsToday}
          sub={
            masjidVisitsToday > 0
              ? formatDuration(
                  day?.visits
                    .filter((visit) => visit.isMasjid)
                    .reduce((total, visit) => total + visit.durationMinutes, 0) ?? 0
                )
              : "None recorded yet"
          }
          icon={MoonStar}
          accent="emerald"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* ------------------------------------------------ today's stops */}
        <SectionCard
          title="Today's stops"
          description="Every place you stayed long enough to count as a visit."
        >
          {loadingDay ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : (day?.visits.length ?? 0) === 0 ? (
            <EmptyState
              icon={MapPin}
              title="No stops yet today"
              description={`A stop is recorded once you stay in one place for ${settings?.minStayMinutes ?? 5} minutes.`}
            />
          ) : (
            <ol className="space-y-2">
              {day!.visits.map((visit) => (
                <li
                  key={visit.id}
                  className={cn(
                    "flex items-start justify-between gap-3 rounded-xl border px-3 py-2.5",
                    visit.isMasjid
                      ? "border-teal-600/40 bg-teal-500/8 dark:border-teal-400/40 dark:bg-teal-400/8"
                      : "border-border bg-muted/40"
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-bold">{visit.name}</p>
                      <KindBadge kind={visit.placeKind} />
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {formatClock(visit.startedAt)} – {formatClock(visit.endedAt)}
                      {visit.placeDistanceMeters != null
                        ? ` · ${visit.placeDistanceMeters} m away`
                        : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-right text-xs font-bold tabular-nums">
                    {formatDuration(visit.durationMinutes)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </SectionCard>

        {/* --------------------------------------------- qibla + nearby */}
        <div className="space-y-4">
          <SectionCard
            title="Qibla from here"
            description="Computed from your position — no network needed."
          >
            {position ? (
              <div className="flex items-center gap-4">
                <div
                  className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-2 border-border bg-muted/40"
                  role="img"
                  aria-label={`Qibla is ${Math.round(qiblaBearing(position))} degrees`}
                >
                  <span className="absolute top-1 text-[9px] font-bold text-muted-foreground">
                    N
                  </span>
                  <span
                    className="absolute h-10 w-1 origin-bottom rounded-full bg-emerald-600 dark:bg-emerald-400"
                    style={{
                      bottom: "50%",
                      transform: `rotate(${qiblaBearing(position)}deg)`,
                      transformOrigin: "bottom center",
                    }}
                  />
                  <Compass className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-2xl font-bold tabular-nums">
                    {Math.round(qiblaBearing(position))}°
                  </p>
                  <p className="text-sm font-semibold text-muted-foreground">
                    {compassPoint(qiblaBearing(position))} of true north
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Hold the phone flat and face this bearing. The dashed green
                    ray on the map points the same way.
                  </p>
                </div>
              </div>
            ) : (
              <p className="py-4 text-sm text-muted-foreground">
                Turn tracking on to read the Qibla from where you are.
              </p>
            )}
          </SectionCard>

          <SectionCard
            title="Masjids near you"
            description={
              nearby
                ? `${nearby.count} within ${(nearby.radius / 1000).toFixed(1)} km · OpenStreetMap`
                : "Search around your current position."
            }
          >
            {!nearby ? (
              <p className="py-4 text-sm text-muted-foreground">
                Press <span className="font-semibold">Masjids near me</span> to
                look up what OpenStreetMap has mapped around you.
              </p>
            ) : nearby.masjids.length === 0 ? (
              <EmptyState
                icon={MoonStar}
                title="Nothing mapped nearby"
                description="OpenStreetMap has no masjid recorded in this radius. It is community-maintained, so it may simply be missing."
              />
            ) : (
              <ul className="space-y-2">
                {nearby.masjids.slice(0, 8).map((masjid) => (
                  <li
                    key={masjid.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {masjid.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {masjid.compass} · ~{masjid.walkMinutes} min walk
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-bold tabular-nums">
                      {formatDistance(masjid.distanceMeters)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- fragments */

function Explainer({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Route;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/12 text-teal-800 dark:text-teal-300">
        <Icon className="h-4 w-4" />
      </span>
      <p className="mt-2 text-sm font-bold">{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{body}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-bold tabular-nums">{value}</p>
    </div>
  );
}

function StatusLine({
  state,
  accuracy,
  queueSize,
}: {
  state: string;
  accuracy: number | null;
  queueSize: number;
}) {
  if (state === "denied") return <>Location permission denied</>;
  if (state === "unsupported") return <>This browser has no Geolocation API</>;
  if (state === "starting") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Loader2 className="h-3 w-3 animate-spin" />
        Waiting for a fix…
      </span>
    );
  }
  if (state === "tracking") {
    return (
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="inline-flex items-center gap-1">
          <Gauge className="h-3 w-3" />
          {accuracy ? `±${Math.round(accuracy)} m` : "Locating"}
        </span>
        {queueSize > 0 ? (
          <span className="inline-flex items-center gap-1 text-amber-800 dark:text-amber-300">
            <WifiOff className="h-3 w-3" />
            {queueSize} queued
          </span>
        ) : (
          <span className="inline-flex items-center gap-1">
            <Navigation className="h-3 w-3" />
            Synced
          </span>
        )}
      </span>
    );
  }
  return <>Flip the switch to start recording this journey</>;
}
