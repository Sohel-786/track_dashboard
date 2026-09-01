"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarRange,
  ChevronDown,
  ExternalLink,
  Loader2,
  MoonStar,
  Repeat2,
  Timer,
  Users,
} from "lucide-react";
import toast from "react-hot-toast";
import { api, ApiError } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import {
  EmptyState,
  SectionCard,
  StatTile,
} from "@/components/dashboard/insight-widgets";
import { MapCanvas } from "@/components/map/MapCanvas";
import type { MapMarker } from "@/components/map/TrackMap";
import {
  BarRow,
  RangeBar,
  defaultRange,
  formatClock,
  formatDay,
  type RangeValue,
} from "@/components/map/map-shared";
import { formatDuration } from "@/lib/geo";
import {
  tableBodyCellClass,
  tableBodyRowClass,
  tableHeadCellClass,
  tableHeadRowClass,
} from "@/lib/ui-styles";
import type { MasjidReport, TrackMasjidsResponse } from "@/types";

export function MapMasjidsTab({ refreshKey = 0 }: { refreshKey?: number }) {
  const [range, setRange] = useState<RangeValue>(() => defaultRange("month"));
  const [data, setData] = useState<TrackMasjidsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        range: range.quick,
        from: range.from,
        to: range.to,
      });
      setData(await api<TrackMasjidsResponse>(`/api/track/masjids?${params}`));
    } catch (error) {
      if (error instanceof ApiError && error.status !== 401) {
        toast.error(error.message);
      }
    } finally {
      setLoading(false);
    }
  }, [range.quick, range.from, range.to]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const masjids = useMemo(() => data?.masjids ?? [], [data]);
  const totals = data?.totals;

  const markers = useMemo<MapMarker[]>(() => {
    const busiest = Math.max(1, ...masjids.map((masjid) => masjid.visitCount));
    return masjids.map((masjid) => ({
      id: masjid.placeId ?? `${masjid.lat},${masjid.lng}`,
      lat: masjid.lat,
      lng: masjid.lng,
      kind: "masjid" as const,
      label: masjid.name,
      // Pin size carries the visit count, so the map reads at a glance.
      weight: 1 + Math.round((masjid.visitCount / busiest) * 4),
      sublabel: `${masjid.visitCount} visit${
        masjid.visitCount === 1 ? "" : "s"
      } · ${formatDuration(masjid.totalMinutes)}`,
    }));
  }, [masjids]);

  return (
    <div className="space-y-5">
      <RangeBar
        value={range}
        onChange={setRange}
        trackingStart={data?.trackingStart}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Masjids visited"
          value={totals?.distinctMasjids ?? 0}
          sub={totals?.mostVisited ? `Most often: ${totals.mostVisited}` : "—"}
          icon={MoonStar}
          accent="teal"
        />
        <StatTile
          label="Total visits"
          value={totals?.totalVisits ?? 0}
          sub={`Average stay ${formatDuration(totals?.averageMinutes ?? 0)}`}
          icon={Repeat2}
          accent="emerald"
        />
        <StatTile
          label="Time in masjid"
          value={formatDuration(totals?.totalMinutes ?? 0)}
          sub="Across every recorded visit"
          icon={Timer}
          accent="blue"
        />
        <StatTile
          label="Prayers there"
          value={totals?.prayerCount ?? 0}
          sub={`${totals?.zamaatCount ?? 0} with zamaat`}
          icon={Users}
          accent="violet"
        />
      </div>

      <MapCanvas
        markers={markers}
        fitKey={`masjids-${range.from}-${range.to}-${masjids.length}`}
        height={380}
        emptyHint="No masjid visits recorded in this window"
        toolbar={
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
            <MoonStar className="h-3.5 w-3.5" />
            Pin size shows how often you went
          </span>
        }
      />

      {masjids.length > 1 ? (
        <SectionCard
          title="Where you pray most"
          description="Time spent, by masjid."
        >
          <ul className="space-y-2.5">
            {masjids.slice(0, 8).map((masjid) => (
              <BarRow
                key={masjid.placeId ?? masjid.name}
                label={masjid.name}
                detail={`${masjid.visitCount}× · ${formatDuration(
                  masjid.totalMinutes
                )}`}
                value={masjid.totalMinutes}
                max={masjids[0].totalMinutes}
                color="#0d9488"
              />
            ))}
          </ul>
        </SectionCard>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading masjid visits…
        </div>
      ) : masjids.length === 0 ? (
        <EmptyState
          icon={MoonStar}
          title="No masjid visits recorded yet"
          description="Turn tracking on before you leave for prayer. A stop inside a mapped masjid is recognised automatically; if yours is not on OpenStreetMap, mark the stop as a masjid from the Places tab."
        />
      ) : (
        <div className="space-y-3">
          {masjids.map((masjid) => (
            <MasjidCard
              key={masjid.placeId ?? `${masjid.lat},${masjid.lng}`}
              masjid={masjid}
              open={
                expanded === (masjid.placeId ?? `${masjid.lat},${masjid.lng}`)
              }
              onToggle={() =>
                setExpanded((current) => {
                  const key = masjid.placeId ?? `${masjid.lat},${masjid.lng}`;
                  return current === key ? null : key;
                })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MasjidCard({
  masjid,
  open,
  onToggle,
}: {
  masjid: MasjidReport;
  open: boolean;
  onToggle: () => void;
}) {
  const osmLink = `https://www.openstreetmap.org/?mlat=${masjid.lat}&mlon=${masjid.lng}#map=18/${masjid.lat}/${masjid.lng}`;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-3 border-b border-border bg-gradient-to-br from-teal-500/8 via-card to-card px-4 py-3.5 text-left transition hover:bg-muted/40 sm:px-5"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-bold tracking-tight">
              {masjid.name}
            </h3>
            <span className="inline-flex items-center rounded-full bg-teal-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-teal-800 dark:bg-teal-400/15 dark:text-teal-200">
              {masjid.visitCount} visit{masjid.visitCount === 1 ? "" : "s"}
            </span>
          </div>
          {masjid.address ? (
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {masjid.address}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDuration(masjid.totalMinutes)} total · average{" "}
            {formatDuration(masjid.averageMinutes)} · longest{" "}
            {formatDuration(masjid.longestMinutes)}
          </p>
        </div>
        <ChevronDown
          className={cn(
            "mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      <div className="grid grid-cols-2 divide-x divide-border border-b border-border sm:grid-cols-4">
        <Fact label="Days visited" value={String(masjid.activeDays)} />
        <Fact label="Prayers logged" value={String(masjid.prayerCount)} />
        <Fact label="With zamaat" value={String(masjid.zamaatCount)} />
        <Fact label="Last visit" value={formatDay(masjid.lastVisitAt.slice(0, 10))} />
      </div>

      {open ? (
        <div className="p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <CalendarRange className="h-3.5 w-3.5" />
              Every visit
            </p>
            <a
              href={osmLink}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-800 hover:underline dark:text-teal-300"
            >
              Open in OpenStreetMap
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          <div className="-mx-3 overflow-x-auto sm:mx-0">
            <table className="w-full min-w-[34rem] border-collapse text-sm">
              <thead>
                <tr className={tableHeadRowClass}>
                  <th className={cn(tableHeadCellClass, "text-left")}>Date</th>
                  <th className={cn(tableHeadCellClass, "text-left")}>Arrived</th>
                  <th className={cn(tableHeadCellClass, "text-left")}>Left</th>
                  <th className={cn(tableHeadCellClass, "text-right")}>Stayed</th>
                  <th className={cn(tableHeadCellClass, "text-left")}>
                    Prayers logged
                  </th>
                </tr>
              </thead>
              <tbody>
                {masjid.visits.map((visit) => (
                  <tr key={visit.visitId} className={tableBodyRowClass}>
                    <td className={cn(tableBodyCellClass, "font-semibold")}>
                      {formatDay(visit.date)}
                    </td>
                    <td className={cn(tableBodyCellClass, "tabular-nums")}>
                      {formatClock(visit.startedAt)}
                    </td>
                    <td className={cn(tableBodyCellClass, "tabular-nums")}>
                      {formatClock(visit.endedAt)}
                    </td>
                    <td
                      className={cn(
                        tableBodyCellClass,
                        "text-right font-bold tabular-nums"
                      )}
                    >
                      {formatDuration(visit.durationMinutes)}
                    </td>
                    <td className={tableBodyCellClass}>
                      {visit.prayers.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {visit.prayers.map((prayer) => (
                            <span
                              key={prayer.prayer}
                              title={
                                prayer.zamaat
                                  ? `${prayer.label} with zamaat`
                                  : prayer.label
                              }
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold",
                                prayer.zamaat
                                  ? "bg-emerald-500/15 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200"
                                  : "bg-muted text-muted-foreground"
                              )}
                            >
                              {prayer.label}
                              {prayer.zamaat ? (
                                <Users className="h-2.5 w-2.5" />
                              ) : null}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-[11px] text-muted-foreground">
            A prayer is listed here when its window overlapped the visit and it
            is marked as prayed on your checklist — so it reflects what you
            recorded, not a guess about what happened.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-bold tabular-nums">{value}</p>
    </div>
  );
}
