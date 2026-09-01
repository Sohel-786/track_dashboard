"use client";

import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { useState, useSyncExternalStore } from "react";
import { Loader2, Map as MapIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BASEMAPS,
  basemapForTheme,
  type BasemapId,
} from "@/components/map/map-basemaps";
import type { TrackMapProps } from "@/components/map/TrackMap";

/**
 * Leaflet reads `window` at import time, so the map can never be part of a
 * server render — this is the only place it is loaded, and it is loaded lazily
 * so no page that does not show a map pays for the library.
 */
const TrackMap = dynamic(() => import("@/components/map/TrackMap"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center gap-2 rounded-xl bg-muted/50 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      Loading map…
    </div>
  ),
});

export type MapCanvasProps = Omit<TrackMapProps, "basemap"> & {
  /** Omit to follow the app theme. */
  basemap?: BasemapId;
  /** Renders the Streets / Light / Dark switcher above the map. */
  showBasemapPicker?: boolean;
  toolbar?: React.ReactNode;
  emptyHint?: string;
};

/**
 * True only after hydration.
 *
 * The theme is not knowable during a server render, and picking the wrong
 * basemap then would paint light tiles behind a dark page and reload them a
 * moment later. `useSyncExternalStore` answers "server or client?" without an
 * effect, so there is no extra render pass to get there.
 */
const subscribeNever = () => () => {};
function useHydrated() {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  );
}

export function MapCanvas({
  basemap,
  showBasemapPicker = true,
  toolbar,
  emptyHint,
  height = 420,
  className,
  ...mapProps
}: MapCanvasProps) {
  const { resolvedTheme } = useTheme();
  const [override, setOverride] = useState<BasemapId | null>(basemap ?? null);
  const mounted = useHydrated();

  const active: BasemapId =
    override ?? basemapForTheme(resolvedTheme === "dark");

  const hasContent =
    (mapProps.markers?.length ?? 0) > 0 || (mapProps.paths?.length ?? 0) > 0;

  return (
    <div className="min-w-0 space-y-2">
      {(showBasemapPicker || toolbar) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">{toolbar}</div>
          {showBasemapPicker ? (
            <div
              className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-card p-0.5"
              role="group"
              aria-label="Map style"
            >
              {(Object.keys(BASEMAPS) as BasemapId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setOverride(id)}
                  aria-pressed={active === id}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[11px] font-bold transition",
                    active === id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {BASEMAPS[id].label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      )}

      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border border-border bg-muted shadow-sm",
          className
        )}
      >
        {mounted ? (
          <TrackMap {...mapProps} basemap={active} height={height} />
        ) : (
          <div
            style={{ height }}
            className="flex items-center justify-center gap-2 text-sm text-muted-foreground"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading map…
          </div>
        )}

        {mounted && !hasContent && emptyHint ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[500] flex justify-center p-3">
            <p className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground shadow-sm">
              <MapIcon className="h-3.5 w-3.5" />
              {emptyHint}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
