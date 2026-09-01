"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Loader2,
  MapPin,
  MoonStar,
  Pencil,
  Repeat2,
  Timer,
  Trash2,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { api, ApiError } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  KindBadge,
  RangeBar,
  defaultRange,
  formatClock,
  formatDateTime,
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
import type {
  TrackPlacesResponse,
  TrackVisitView,
} from "@/types";

type KindFilter = "all" | "masjid" | "place" | "unknown";

type VisitsResponse = {
  visits: TrackVisitView[];
  total: number;
  trackingStart: string;
};

export function MapPlacesTab({
  refreshKey = 0,
  onChanged,
}: {
  refreshKey?: number;
  onChanged?: () => void;
}) {
  const [range, setRange] = useState<RangeValue>(() => defaultRange("month"));
  const [kind, setKind] = useState<KindFilter>("all");
  const [data, setData] = useState<TrackPlacesResponse | null>(null);
  const [visits, setVisits] = useState<VisitsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [localRefresh, setLocalRefresh] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        range: range.quick,
        from: range.from,
        to: range.to,
      });
      if (kind === "masjid") params.set("kind", "masjid");

      const visitParams = new URLSearchParams(params);
      visitParams.delete("kind");
      if (kind !== "all") visitParams.set("kind", kind);
      visitParams.set("limit", "60");

      const [places, visitList] = await Promise.all([
        api<TrackPlacesResponse>(`/api/track/places?${params}`),
        api<VisitsResponse>(`/api/track/visits?${visitParams}`),
      ]);
      setData(places);
      setVisits(visitList);
    } catch (error) {
      if (error instanceof ApiError && error.status !== 401) {
        toast.error(error.message);
      }
    } finally {
      setLoading(false);
    }
  }, [range.quick, range.from, range.to, kind]);

  useEffect(() => {
    void load();
  }, [load, refreshKey, localRefresh]);

  const places = useMemo(() => {
    const all = data?.places ?? [];
    if (kind === "all") return all;
    return all.filter((place) => place.kind === kind);
  }, [data?.places, kind]);

  const markers = useMemo<MapMarker[]>(() => {
    const busiest = Math.max(1, ...places.map((place) => place.visitCount));
    return places.map((place) => ({
      id: `${place.placeId ?? place.name}-${place.lat}`,
      lat: place.lat,
      lng: place.lng,
      kind: place.kind === "masjid" ? ("masjid" as const) : ("place" as const),
      label: place.name,
      weight: 1 + Math.round((place.visitCount / busiest) * 4),
      sublabel: `${place.visitCount} visit${
        place.visitCount === 1 ? "" : "s"
      } · ${formatDuration(place.totalMinutes)}`,
    }));
  }, [places]);

  const totalMinutes = places.reduce(
    (total, place) => total + place.totalMinutes,
    0
  );
  const totalVisits = places.reduce(
    (total, place) => total + place.visitCount,
    0
  );

  return (
    <div className="space-y-5">
      <RangeBar
        value={range}
        onChange={setRange}
        trackingStart={data?.trackingStart}
      >
        <Select
          value={kind}
          onValueChange={(value) => setKind(value as KindFilter)}
        >
          <SelectTrigger aria-label="Filter by place type" className="sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All places</SelectItem>
            <SelectItem value="masjid">Masjids only</SelectItem>
            <SelectItem value="place">Named places</SelectItem>
            <SelectItem value="unknown">Unnamed stops</SelectItem>
          </SelectContent>
        </Select>
      </RangeBar>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Distinct places"
          value={places.length}
          sub="In the selected window"
          icon={MapPin}
          accent="indigo"
        />
        <StatTile
          label="Total visits"
          value={totalVisits}
          sub={`${formatDuration(totalMinutes)} in total`}
          icon={Repeat2}
          accent="blue"
        />
        <StatTile
          label="Masjids"
          value={places.filter((place) => place.kind === "masjid").length}
          sub={`${formatDuration(
            places
              .filter((place) => place.kind === "masjid")
              .reduce((total, place) => total + place.totalMinutes, 0)
          )} spent there`}
          icon={MoonStar}
          accent="teal"
        />
        <StatTile
          label="Longest single stay"
          value={formatDuration(
            Math.max(0, ...places.map((place) => place.longestMinutes))
          )}
          sub={
            places.length > 0
              ? [...places].sort(
                  (a, b) => b.longestMinutes - a.longestMinutes
                )[0].name
              : "—"
          }
          icon={Timer}
          accent="violet"
        />
      </div>

      <MapCanvas
        markers={markers}
        fitKey={`places-${range.from}-${range.to}-${kind}-${places.length}`}
        height={380}
        emptyHint="No places recorded in this window"
      />

      <SectionCard
        title="Places you spend time"
        description="Ranked by total time, not by how often you drop by."
      >
        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : places.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="Nothing recorded here yet"
            description="Places appear once tracking has run for a while and a stop lasts past your minimum stay."
          />
        ) : (
          <div className="-mx-4 overflow-x-auto sm:mx-0">
            <table className="w-full min-w-[40rem] border-collapse text-sm">
              <thead>
                <tr className={tableHeadRowClass}>
                  <th className={cn(tableHeadCellClass, "text-left")}>Place</th>
                  <th className={cn(tableHeadCellClass, "text-right")}>Visits</th>
                  <th className={cn(tableHeadCellClass, "text-right")}>Days</th>
                  <th className={cn(tableHeadCellClass, "text-right")}>Total</th>
                  <th className={cn(tableHeadCellClass, "text-right")}>Average</th>
                  <th className={cn(tableHeadCellClass, "text-right")}>Longest</th>
                  <th className={cn(tableHeadCellClass, "text-left")}>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {places.map((place) => (
                  <tr
                    key={`${place.placeId ?? place.name}-${place.lat}`}
                    className={tableBodyRowClass}
                  >
                    <td className={tableBodyCellClass}>
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 truncate font-semibold">
                          {place.name}
                        </span>
                        <KindBadge kind={place.kind} />
                      </div>
                      {place.address ? (
                        <p className="mt-0.5 max-w-sm truncate text-[11px] text-muted-foreground">
                          {place.address}
                        </p>
                      ) : null}
                    </td>
                    <td
                      className={cn(
                        tableBodyCellClass,
                        "text-right font-bold tabular-nums"
                      )}
                    >
                      {place.visitCount}
                    </td>
                    <td
                      className={cn(tableBodyCellClass, "text-right tabular-nums")}
                    >
                      {place.activeDays}
                    </td>
                    <td
                      className={cn(
                        tableBodyCellClass,
                        "text-right font-bold tabular-nums"
                      )}
                    >
                      {formatDuration(place.totalMinutes)}
                    </td>
                    <td
                      className={cn(tableBodyCellClass, "text-right tabular-nums")}
                    >
                      {formatDuration(place.averageMinutes)}
                    </td>
                    <td
                      className={cn(tableBodyCellClass, "text-right tabular-nums")}
                    >
                      {formatDuration(place.longestMinutes)}
                    </td>
                    <td className={cn(tableBodyCellClass, "whitespace-nowrap")}>
                      {formatDateTime(place.lastVisitAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Correct a stop"
        description="OpenStreetMap does not know every masjid. Rename a stop, or tell TrackDash what it really was."
      >
        {(visits?.visits.length ?? 0) === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            No individual stops recorded in this window.
          </p>
        ) : (
          <ul className="space-y-2">
            {visits!.visits.map((visit) => (
              <VisitRow
                key={visit.id}
                visit={visit}
                onChanged={() => {
                  setLocalRefresh((value) => value + 1);
                  onChanged?.();
                }}
              />
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function VisitRow({
  visit,
  onChanged,
}: {
  visit: TrackVisitView;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(visit.hasCustomName ? visit.name : "");
  const [busy, setBusy] = useState(false);

  async function patch(body: Record<string, unknown>, message: string) {
    setBusy(true);
    try {
      await api(`/api/track/visits/${visit.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      toast.success(message);
      setEditing(false);
      onChanged();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not update stop"
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api(`/api/track/visits/${visit.id}`, { method: "DELETE" });
      toast.success("Stop removed from your history");
      onChanged();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not remove stop"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <li
      className={cn(
        "rounded-xl border px-3 py-2.5",
        visit.isMasjid
          ? "border-teal-600/40 bg-teal-500/8 dark:border-teal-400/40 dark:bg-teal-400/8"
          : "border-border bg-muted/40"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-bold">{visit.name}</p>
            <KindBadge kind={visit.placeKind} />
            {visit.pendingLookup ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                naming
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {formatDay(visit.date)} · {formatClock(visit.startedAt)} –{" "}
            {formatClock(visit.endedAt)} · {formatDuration(visit.durationMinutes)}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {!visit.isMasjid ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              loading={busy}
              onClick={() =>
                void patch({ placeKind: "masjid" }, "Marked as a masjid")
              }
            >
              <MoonStar className="h-3.5 w-3.5" />
              It&apos;s a masjid
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              loading={busy}
              onClick={() =>
                void patch({ placeKind: "place" }, "No longer counted as a masjid")
              }
            >
              <X className="h-3.5 w-3.5" />
              Not a masjid
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setEditing((value) => !value)}
            aria-label="Rename stop"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            loading={busy}
            onClick={() => void remove()}
            aria-label="Remove stop"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {editing ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Your own name for this place"
            maxLength={200}
            className="h-9 max-w-xs flex-1"
          />
          <Button
            type="button"
            size="sm"
            loading={busy}
            onClick={() =>
              void patch(
                { customName: name },
                name.trim() ? "Renamed" : "Reverted to the mapped name"
              )
            }
          >
            <Check className="h-3.5 w-3.5" />
            Save
          </Button>
        </div>
      ) : null}
    </li>
  );
}
