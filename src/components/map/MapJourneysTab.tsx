"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Download,
  Loader2,
  MapPin,
  MoonStar,
  Route,
  Timer,
} from "lucide-react";
import toast from "react-hot-toast";
import { api, ApiError } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EmptyState,
  SectionCard,
  StatTile,
} from "@/components/dashboard/insight-widgets";
import { MapCanvas } from "@/components/map/MapCanvas";
import type { MapMarker } from "@/components/map/TrackMap";
import {
  BarRow,
  DistanceBars,
  KindBadge,
  RangeBar,
  defaultRange,
  formatClock,
  formatDay,
  type RangeValue,
} from "@/components/map/map-shared";
import { formatDistance, formatDuration } from "@/lib/geo";
import { downloadTrack, type TrackExportFormat } from "@/components/map/track-export";
import type { TrackDayResponse, TrackOverviewResponse } from "@/types";

export function MapJourneysTab({ refreshKey = 0 }: { refreshKey?: number }) {
  const [range, setRange] = useState<RangeValue>(() => defaultRange("week"));
  const [overview, setOverview] = useState<TrackOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [day, setDay] = useState<TrackDayResponse | null>(null);
  const [loadingDay, setLoadingDay] = useState(false);
  const [exportFormat, setExportFormat] = useState<TrackExportFormat>("gpx");

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        range: range.quick,
        from: range.from,
        to: range.to,
      });
      const result = await api<TrackOverviewResponse>(
        `/api/track/overview?${params}`
      );
      setOverview(result);

      // Open on the most recent day that actually has a track.
      const withTrack = [...result.daily]
        .reverse()
        .find((entry) => entry.pointCount > 0);
      setSelectedDate((current) =>
        current && result.daily.some((entry) => entry.date === current)
          ? current
          : (withTrack?.date ?? null)
      );
    } catch (error) {
      if (error instanceof ApiError && error.status !== 401) {
        toast.error(error.message);
      }
    } finally {
      setLoading(false);
    }
  }, [range.quick, range.from, range.to]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview, refreshKey]);

  useEffect(() => {
    if (!selectedDate) {
      setDay(null);
      return;
    }
    let cancelled = false;
    setLoadingDay(true);
    void (async () => {
      try {
        const result = await api<TrackDayResponse>(
          `/api/track/day?date=${selectedDate}`
        );
        if (!cancelled) setDay(result);
      } catch (error) {
        if (
          !cancelled &&
          error instanceof ApiError &&
          error.status !== 401
        ) {
          toast.error(error.message);
        }
      } finally {
        if (!cancelled) setLoadingDay(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  /* ------------------------------------------------------------ map data */

  const markers = useMemo<MapMarker[]>(() => {
    const visits = day?.visits ?? [];
    return visits.map((visit, index) => ({
      id: visit.id,
      lat: visit.lat,
      lng: visit.lng,
      kind:
        visit.isMasjid
          ? ("masjid" as const)
          : index === 0
            ? ("start" as const)
            : index === visits.length - 1
              ? ("end" as const)
              : ("place" as const),
      label: visit.name,
      sublabel: `${formatClock(visit.startedAt)} – ${formatClock(
        visit.endedAt
      )} · ${formatDuration(visit.durationMinutes)}`,
    }));
  }, [day?.visits]);

  const paths = useMemo(() => {
    const points = day?.path ?? [];
    if (points.length < 2) return [];
    return [
      {
        id: `day-${day?.date}`,
        points: points.map((point) => ({ lat: point.lat, lng: point.lng })),
        color: "#0d9488",
        width: 4,
      },
    ];
  }, [day?.path, day?.date]);

  const busiestHours = useMemo(() => {
    const hours = overview?.byHour ?? [];
    const max = Math.max(1, ...hours.map((entry) => entry.visits));
    return hours
      .filter((entry) => entry.visits > 0)
      .sort((a, b) => b.visits - a.visits)
      .slice(0, 6)
      .map((entry) => ({
        label: `${String(entry.hour).padStart(2, "0")}:00`,
        detail: `${entry.visits} stop${entry.visits === 1 ? "" : "s"}`,
        value: entry.visits,
        max,
        color: entry.masjidVisits > 0 ? "#0d9488" : "#6366f1",
      }));
  }, [overview?.byHour]);

  function exportDay(format: TrackExportFormat) {
    if (!day || day.path.length === 0) {
      toast.error("Nothing recorded on this day to export.");
      return;
    }
    downloadTrack(day, format);
    toast.success(`Exported ${day.date} as ${format.toUpperCase()}`);
  }

  const totals = overview?.totals;
  const daysWithTrack = (overview?.daily ?? []).filter(
    (entry) => entry.pointCount > 0 || entry.visitCount > 0
  );

  return (
    <div className="space-y-5">
      <RangeBar
        value={range}
        onChange={setRange}
        trackingStart={overview?.trackingStart}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Distance travelled"
          value={formatDistance(totals?.distanceMeters ?? 0)}
          sub={`${totals?.trackedDays ?? 0} day${
            (totals?.trackedDays ?? 0) === 1 ? "" : "s"
          } with a track`}
          icon={Route}
          accent="teal"
        />
        <StatTile
          label="Time moving"
          value={formatDuration(totals?.movingMinutes ?? 0)}
          sub={`Daily average ${formatDistance(totals?.averageDailyMeters ?? 0)}`}
          icon={Timer}
          accent="blue"
        />
        <StatTile
          label="Places visited"
          value={totals?.visitCount ?? 0}
          sub={`${totals?.distinctPlaces ?? 0} distinct place${
            (totals?.distinctPlaces ?? 0) === 1 ? "" : "s"
          }`}
          icon={MapPin}
          accent="indigo"
        />
        <StatTile
          label="Masjid visits"
          value={totals?.masjidVisits ?? 0}
          sub={
            (totals?.masjidVisits ?? 0) > 0
              ? `${totals?.distinctMasjids} masjid${
                  totals?.distinctMasjids === 1 ? "" : "s"
                } · ${formatDuration(totals?.masjidMinutes ?? 0)}`
              : "None recorded in this window"
          }
          icon={MoonStar}
          accent="emerald"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <SectionCard
          title="Distance by day"
          description={
            totals?.longestDayDate
              ? `Furthest: ${formatDay(totals.longestDayDate)} · ${formatDistance(
                  totals.longestDayMeters
                )}`
              : "No distance recorded in this window."
          }
        >
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : (overview?.daily.length ?? 0) === 0 ? (
            <EmptyState
              icon={Route}
              title="Nothing tracked yet"
              description="Turn tracking on from the Live tab and your journeys will appear here."
            />
          ) : (
            <DistanceBars days={overview!.daily} />
          )}
        </SectionCard>

        <SectionCard
          title="When you are out"
          description="Stops by hour of day."
        >
          {busiestHours.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              No stops recorded in this window.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {busiestHours.map((row) => (
                <BarRow key={row.label} {...row} />
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* -------------------------------------------------------- day replay */}
      <SectionCard
        title="Replay a day"
        description={
          day
            ? `${formatDay(day.date)} · ${formatDistance(
                day.summary.distanceMeters
              )} across ${day.visits.length} stop${
                day.visits.length === 1 ? "" : "s"
              }`
            : "Pick a day to redraw its route."
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-40">
              <Select
                value={selectedDate ?? ""}
                onValueChange={(value) => setSelectedDate(value)}
                disabled={daysWithTrack.length === 0}
              >
                <SelectTrigger aria-label="Choose a day">
                  <SelectValue placeholder="Choose a day" />
                </SelectTrigger>
                <SelectContent>
                  {[...daysWithTrack].reverse().map((entry) => (
                    <SelectItem key={entry.date} value={entry.date}>
                      {entry.dayLabel} · {formatDistance(entry.distanceMeters)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-24">
              <Select
                value={exportFormat}
                onValueChange={(value) =>
                  setExportFormat(value as TrackExportFormat)
                }
              >
                <SelectTrigger aria-label="Export format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpx">GPX</SelectItem>
                  <SelectItem value="geojson">GeoJSON</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => exportDay(exportFormat)}
              disabled={!day || day.path.length === 0}
            >
              <Download className="h-4 w-4" />
              Export
            </Button>
          </div>
        }
        bodyClassName="space-y-4"
      >
        {loadingDay ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading day…
          </div>
        ) : !day || daysWithTrack.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No day selected"
            description="Days with a recorded track show up in the picker above."
          />
        ) : (
          <>
            <MapCanvas
              markers={markers}
              paths={paths}
              fitKey={`${day.date}-${day.path.length}-${day.visits.length}`}
              height={400}
              showBasemapPicker={false}
              emptyHint="No fixes recorded on this day"
            />

            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Stops
                </p>
                {day.visits.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Moving all day — no stop lasted long enough to record.
                  </p>
                ) : (
                  <ol className="space-y-2">
                    {day.visits.map((visit) => (
                      <li
                        key={visit.id}
                        className={cn(
                          "flex items-start justify-between gap-3 rounded-xl border px-3 py-2",
                          visit.isMasjid
                            ? "border-teal-600/40 bg-teal-500/8 dark:border-teal-400/40 dark:bg-teal-400/8"
                            : "border-border bg-muted/40"
                        )}
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold">
                              {visit.name}
                            </p>
                            <KindBadge kind={visit.placeKind} />
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {formatClock(visit.startedAt)} –{" "}
                            {formatClock(visit.endedAt)}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs font-bold tabular-nums">
                          {formatDuration(visit.durationMinutes)}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Journeys between stops
                </p>
                {day.trips.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No completed journey between two stops on this day.
                  </p>
                ) : (
                  <ol className="space-y-2">
                    {day.trips.map((trip) => (
                      <li
                        key={trip.startedAt}
                        className="rounded-xl border border-border bg-muted/40 px-3 py-2"
                      >
                        <div className="flex items-center gap-1.5 text-sm font-semibold">
                          <span className="min-w-0 truncate">{trip.fromName}</span>
                          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 truncate">{trip.toName}</span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {formatClock(trip.startedAt)} · {formatDistance(trip.distanceMeters)} ·{" "}
                          {formatDuration(trip.durationMinutes)}
                          {trip.averageSpeedKmh > 0
                            ? ` · ${trip.averageSpeedKmh} km/h`
                            : ""}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-muted/30 p-3 sm:grid-cols-4">
              <DayFact label="Distance" value={formatDistance(day.summary.distanceMeters)} />
              <DayFact label="Moving" value={formatDuration(day.summary.movingMinutes)} />
              <DayFact label="Stopped" value={formatDuration(day.summary.stationaryMinutes)} />
              <DayFact
                label="Top speed"
                value={day.summary.maxSpeedKmh > 0 ? `${day.summary.maxSpeedKmh} km/h` : "—"}
              />
            </div>
          </>
        )}
      </SectionCard>

      {(overview?.topPlaces.length ?? 0) > 0 ? (
        <SectionCard
          title="Where the time went"
          description="Most time spent in this window."
        >
          <ul className="space-y-2.5">
            {overview!.topPlaces.map((place) => (
              <BarRow
                key={`${place.placeId ?? place.name}-${place.lat}`}
                label={place.name}
                detail={formatDuration(place.totalMinutes)}
                value={place.totalMinutes}
                max={overview!.topPlaces[0].totalMinutes}
                color={place.kind === "masjid" ? "#0d9488" : "#6366f1"}
              />
            ))}
          </ul>
        </SectionCard>
      ) : null}
    </div>
  );
}

function DayFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-bold tabular-nums">{value}</p>
    </div>
  );
}
