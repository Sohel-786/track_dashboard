"use client";

/**
 * The Leaflet canvas.
 *
 * Only ever reached through `MapCanvas`, which loads it with `ssr: false` —
 * Leaflet touches `window` the moment it is imported, so it cannot be part of a
 * server render. The component owns the imperative map instance and syncs it to
 * props; nothing outside this file talks to Leaflet directly.
 */

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  BASEMAPS,
  FALLBACK_CENTER,
  FALLBACK_ZOOM,
  type BasemapId,
} from "@/components/map/map-basemaps";

export type MapPoint = { lat: number; lng: number };

export type MapMarker = MapPoint & {
  id: string;
  kind: "masjid" | "place" | "current" | "start" | "end";
  label: string;
  sublabel?: string;
  /** 1–5, scales masjid pins by how often the place was visited. */
  weight?: number;
  onSelect?: () => void;
};

export type MapPath = {
  id: string;
  points: MapPoint[];
  color?: string;
  dashed?: boolean;
  width?: number;
};

export type TrackMapProps = {
  basemap: BasemapId;
  markers?: MapMarker[];
  paths?: MapPath[];
  /** Live position accuracy halo, in metres. */
  accuracy?: (MapPoint & { radius: number }) | null;
  /** Draws a ray towards Makkah from the given point. */
  qibla?: (MapPoint & { bearing: number }) | null;
  center?: MapPoint | null;
  zoom?: number;
  /** Re-fit the view to all content whenever this value changes. */
  fitKey?: string;
  height?: number;
  className?: string;
  /** Fired when the person drags or pinches the map themselves. */
  onUserPan?: () => void;
};

/** Marker colours, chosen to clear 3:1 on both light and dark tiles. */
const MARKER_STYLE: Record<
  MapMarker["kind"],
  { fill: string; ring: string; glyph: string }
> = {
  masjid: { fill: "#0d9488", ring: "#ffffff", glyph: "☾" },
  place: { fill: "#6366f1", ring: "#ffffff", glyph: "" },
  current: { fill: "#2563eb", ring: "#ffffff", glyph: "" },
  start: { fill: "#059669", ring: "#ffffff", glyph: "A" },
  end: { fill: "#e11d48", ring: "#ffffff", glyph: "B" },
};

/** Below this, a recentre is noise — leave the view where it is. */
const RECENTRE_EPSILON_DEG = 0.00002;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function markerIcon(marker: MapMarker) {
  const style = MARKER_STYLE[marker.kind];
  const scale =
    marker.kind === "masjid"
      ? Math.min(5, Math.max(1, marker.weight ?? 1))
      : 1;
  const size =
    marker.kind === "current" ? 18 : marker.kind === "masjid" ? 22 + scale * 3 : 16;

  const pulse =
    marker.kind === "current"
      ? `<span style="position:absolute;inset:-6px;border-radius:9999px;background:${style.fill};opacity:.25;animation:trackdash-ping 1.8s cubic-bezier(0,0,.2,1) infinite"></span>`
      : "";

  return L.divIcon({
    className: "trackdash-marker",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html:
      `<span style="position:relative;display:flex;align-items:center;justify-content:center;` +
      `width:${size}px;height:${size}px;border-radius:9999px;background:${style.fill};` +
      `border:2px solid ${style.ring};box-shadow:0 1px 4px rgba(0,0,0,.45);` +
      `color:#fff;font-size:${Math.round(size * 0.5)}px;font-weight:700;line-height:1">` +
      `${pulse}<span style="position:relative">${style.glyph}</span></span>`,
  });
}

function popupHtml(marker: MapMarker) {
  const sub = marker.sublabel
    ? `<div style="margin-top:2px;opacity:.75">${escapeHtml(marker.sublabel)}</div>`
    : "";
  return (
    `<div style="font-size:12px;line-height:1.4;min-width:130px">` +
    `<div style="font-weight:700">${escapeHtml(marker.label)}</div>${sub}</div>`
  );
}

/** Point `distanceMeters` from `origin` along a compass bearing. */
function projectPoint(
  origin: MapPoint,
  bearingDegrees: number,
  distanceMeters: number
): MapPoint {
  const radius = 6_371_008.8;
  const angular = distanceMeters / radius;
  const bearing = (bearingDegrees * Math.PI) / 180;
  const lat1 = (origin.lat * Math.PI) / 180;
  const lng1 = (origin.lng * Math.PI) / 180;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) +
      Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2)
    );

  return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI };
}

export default function TrackMap({
  basemap,
  markers = [],
  paths = [],
  accuracy = null,
  qibla = null,
  center = null,
  zoom,
  fitKey,
  height = 420,
  className,
  onUserPan,
}: TrackMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const overlayRef = useRef<L.LayerGroup | null>(null);
  const fittedKeyRef = useRef<string | null>(null);
  const onUserPanRef = useRef(onUserPan);

  // Kept in a ref so a new callback identity never tears down the map.
  useEffect(() => {
    onUserPanRef.current = onUserPan;
  }, [onUserPan]);

  /* -------------------------------------------------------------- create */

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const map = L.map(container, {
      center: [FALLBACK_CENTER.lat, FALLBACK_CENTER.lng],
      zoom: FALLBACK_ZOOM,
      zoomControl: true,
      attributionControl: true,
      /**
       * Both wheel-zoom and one-finger drag are handled by hand below, so the
       * map never swallows a page scroll. Leaflet's own handlers would fight
       * that, so they stay off.
       */
      scrollWheelZoom: false,
      // Keeps a pinch from ending on a jarring fractional zoom level.
      zoomSnap: 0.5,
    });

    L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);
    overlayRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    /* ------------------------------------------------------- gestures */

    /**
     * Gesture handling, the bargain every embedded map has to make.
     *
     * A full-width map in the middle of a scrolling page is a trap on a phone:
     * a thumb-swipe meant to scroll past it pans the map instead, and the page
     * is stuck. Leaflet's defaults do exactly that, because Leaflet assumes the
     * map *is* the page.
     *
     * So on a touch device the map starts inert — the page scrolls straight
     * through it — and one tap on the veil hands it the gestures. It re-arms
     * when the map scrolls out of sight, so the trap never comes back.
     *
     * (Two-finger-to-pan was the first attempt and is a dead end: Leaflet's own
     * drag handler ignores a multi-touch pointerdown, so the map received the
     * gesture and did nothing with it, leaving the map unpannable altogether.)
     *
     * Desktop keeps a mouse drag, which is unambiguous, and only the wheel is
     * intercepted — it scrolls the page unless Ctrl/⌘ is held.
     */
    const touchDevice =
      navigator.maxTouchPoints > 0 ||
      window.matchMedia("(pointer: coarse)").matches;

    const hint = L.DomUtil.create("div", "trackdash-gesture-hint", container);
    hint.setAttribute("aria-hidden", "true");
    let hintTimer = 0;

    const showHint = (text: string) => {
      hint.textContent = text;
      hint.classList.add("is-visible");
      window.clearTimeout(hintTimer);
      hintTimer = window.setTimeout(
        () => hint.classList.remove("is-visible"),
        1600
      );
    };

    const hideHint = () => {
      window.clearTimeout(hintTimer);
      hint.classList.remove("is-visible");
    };

    /* -------------------------------------------------- tap to activate */

    const veil = L.DomUtil.create("button", "trackdash-map-veil", container);
    veil.type = "button";
    // A span, not a bare text node, so it can sit above the gradient.
    const veilLabel = L.DomUtil.create("span", "", veil);
    veilLabel.textContent = "Tap to move the map";

    /** Leaflet starts with its handlers enabled, so this mirrors reality. */
    let live = true;

    const setLive = (next: boolean) => {
      if (next === live) return;
      live = next;
      if (next) {
        map.dragging.enable();
        map.touchZoom.enable();
      } else {
        map.dragging.disable();
        map.touchZoom.disable();
      }
      // Drives `touch-action`: the page may scroll through an inert map.
      container.classList.toggle("trackdash-live", next);
      veil.classList.toggle("is-visible", !next);
    };

    if (touchDevice) setLive(false);

    const activate = () => setLive(true);
    veil.addEventListener("click", activate);

    /**
     * Re-arm once the map has scrolled away, so returning to it later starts
     * from the safe state rather than whatever the last visit left behind.
     */
    let visibility: IntersectionObserver | null = null;
    if (touchDevice) {
      visibility = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) setLive(false);
          }
        },
        { threshold: 0 }
      );
      visibility.observe(container);
    }

    /* -------------------------------------------------------- wheel zoom */

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        // Also stops the browser's own pinch-zoom of the whole page.
        event.preventDefault();
        hideHint();
        const step = event.deltaY > 0 ? -1 : 1;
        map.setZoomAround(map.mouseEventToLatLng(event), map.getZoom() + step);
        return;
      }
      showHint(
        /Mac|iPhone|iPad/.test(navigator.userAgent)
          ? "Use ⌘ + scroll to zoom the map"
          : "Use Ctrl + scroll to zoom the map"
      );
    };

    container.addEventListener("wheel", onWheel, { passive: false });

    const onDragStart = () => {
      hideHint();
      onUserPanRef.current?.();
    };
    map.on("dragstart", onDragStart);

    /**
     * Leaflet measures its container once. Inside a tab panel that container is
     * zero-height until the tab is shown, which leaves the map a grey box —
     * re-measuring on resize is what makes it survive tab switches and rotation.
     */
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);

    return () => {
      window.clearTimeout(hintTimer);
      /**
       * `map.remove()` tears down Leaflet's own panes but leaves anything else
       * that was appended to the container, and the container itself outlives a
       * remount — so without this the overlays are orphaned and a second, live
       * set is stacked on top of them.
       */
      hint.remove();
      veil.removeEventListener("click", activate);
      veil.remove();
      visibility?.disconnect();
      observer.disconnect();
      container.removeEventListener("wheel", onWheel);
      map.off("dragstart", onDragStart);
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
      tileRef.current = null;
    };
  }, []);

  /* ------------------------------------------------------------ basemap */

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    tileRef.current?.remove();
    const config = BASEMAPS[basemap] ?? BASEMAPS.light;
    tileRef.current = L.tileLayer(config.url, {
      attribution: config.attribution,
      maxZoom: config.maxZoom,
      // Serve @2x tiles to retina screens where the provider offers them.
      detectRetina: true,
      // Hold a wider ring of tiles so a pan does not flash empty squares.
      keepBuffer: 3,
    }).addTo(map);
    tileRef.current.bringToBack();
  }, [basemap]);

  /* ------------------------------------------------------------ overlays */

  const signature = useMemo(
    () =>
      JSON.stringify({
        markers: markers.map((marker) => [
          marker.id,
          marker.lat,
          marker.lng,
          marker.kind,
          marker.label,
          marker.sublabel,
          marker.weight,
        ]),
        paths: paths.map((path) => [
          path.id,
          path.color,
          path.dashed,
          path.width,
          path.points.length,
          path.points[0]?.lat,
          path.points[path.points.length - 1]?.lat,
        ]),
        accuracy,
        qibla,
      }),
    [markers, paths, accuracy, qibla]
  );

  useEffect(() => {
    const map = mapRef.current;
    const overlay = overlayRef.current;
    if (!map || !overlay) return;

    overlay.clearLayers();
    const bounds = L.latLngBounds([]);

    for (const path of paths) {
      if (path.points.length < 2) continue;
      const latlngs = path.points.map(
        (point) => [point.lat, point.lng] as [number, number]
      );

      // A wide translucent casing under a thin bright line keeps the route
      // legible over both pale streets and dark satellite-ish tiles.
      L.polyline(latlngs, {
        color: path.color ?? "#0d9488",
        weight: (path.width ?? 4) + 5,
        opacity: 0.22,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(overlay);

      L.polyline(latlngs, {
        color: path.color ?? "#0d9488",
        weight: path.width ?? 4,
        opacity: 0.95,
        lineCap: "round",
        lineJoin: "round",
        dashArray: path.dashed ? "6 8" : undefined,
      }).addTo(overlay);

      latlngs.forEach((point) => bounds.extend(point));
    }

    if (accuracy && accuracy.radius > 0) {
      L.circle([accuracy.lat, accuracy.lng], {
        radius: Math.min(accuracy.radius, 2000),
        color: "#2563eb",
        weight: 1,
        opacity: 0.5,
        fillColor: "#2563eb",
        fillOpacity: 0.1,
      }).addTo(overlay);
    }

    if (qibla) {
      const target = projectPoint(qibla, qibla.bearing, 900);
      L.polyline(
        [
          [qibla.lat, qibla.lng],
          [target.lat, target.lng],
        ],
        {
          color: "#059669",
          weight: 3,
          opacity: 0.85,
          dashArray: "10 6",
        }
      )
        .bindTooltip("Qibla", { permanent: false, direction: "top" })
        .addTo(overlay);
    }

    for (const marker of markers) {
      const pin = L.marker([marker.lat, marker.lng], {
        icon: markerIcon(marker),
        title: marker.label,
        keyboard: true,
        // The live position sits above every historic pin.
        zIndexOffset: marker.kind === "current" ? 1000 : 0,
      })
        .bindPopup(popupHtml(marker))
        .addTo(overlay);

      if (marker.onSelect) pin.on("click", marker.onSelect);
      bounds.extend([marker.lat, marker.lng]);
    }

    // Fit once per dataset; refitting on every render would fight the user's pan.
    if (fitKey && fitKey !== fittedKeyRef.current && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 17 });
      fittedKeyRef.current = fitKey;
    }
  }, [signature, fitKey, markers, paths, accuracy, qibla]);

  /* ---------------------------------------------------------- recentring */

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !center) return;

    const target = L.latLng(center.lat, center.lng);
    const current = map.getCenter();
    const sameZoom = zoom === undefined || Math.abs(map.getZoom() - zoom) < 0.01;
    const samePlace =
      Math.abs(current.lat - target.lat) < RECENTRE_EPSILON_DEG &&
      Math.abs(current.lng - target.lng) < RECENTRE_EPSILON_DEG;

    // GPS jitter arrives several times a minute; re-animating for a metre of
    // drift makes the map feel like it is twitching under the user's finger.
    if (samePlace && sameZoom) return;

    map.setView(target, zoom ?? map.getZoom(), { animate: true });
  }, [center?.lat, center?.lng, zoom, center]);

  return (
    <>
      {/*
        Scoped to this component so the live-position pulse does not need a
        global keyframe, and the map's own surface tokens follow the app theme.
      */}
      <style>{`
        @keyframes trackdash-ping {
          75%, 100% { transform: scale(1.9); opacity: 0; }
        }
        .leaflet-container {
          background: hsl(var(--muted));
          font: inherit;
          outline: none;
          /*
           * Inert by default so a thumb-swipe scrolls the page straight through
           * the map. The trackdash-live class is added once the veil has been
           * tapped, handing every gesture back to Leaflet.
           */
          touch-action: pan-x pan-y;
        }
        .leaflet-container.trackdash-live { touch-action: none; }
        .leaflet-control-attribution {
          background: hsl(var(--card) / 0.85) !important;
          color: hsl(var(--muted-foreground)) !important;
          font-size: 10px !important;
        }
        .leaflet-control-attribution a { color: hsl(var(--primary)) !important; }
        .leaflet-bar a {
          background: hsl(var(--card)) !important;
          color: hsl(var(--foreground)) !important;
          border-color: hsl(var(--border)) !important;
        }
        .leaflet-bar a:hover { background: hsl(var(--muted)) !important; }
        .leaflet-control-scale-line {
          background: hsl(var(--card) / 0.8) !important;
          color: hsl(var(--foreground)) !important;
          border-color: hsl(var(--border)) !important;
        }
        .leaflet-popup-content-wrapper, .leaflet-popup-tip {
          background: hsl(var(--card)) !important;
          color: hsl(var(--foreground)) !important;
          box-shadow: 0 8px 24px -8px rgba(0,0,0,.45) !important;
        }
        .leaflet-popup-content { margin: 10px 12px !important; }
        .trackdash-marker { background: none; border: none; }

        .trackdash-gesture-hint {
          position: absolute;
          inset: 0;
          z-index: 1200;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 1.5rem;
          text-align: center;
          font-size: 13px;
          font-weight: 700;
          color: #fff;
          background: rgba(15, 23, 42, 0.55);
          opacity: 0;
          visibility: hidden;
          transition: opacity .18s ease, visibility .18s ease;
          pointer-events: none;
        }
        .trackdash-gesture-hint.is-visible { opacity: 1; visibility: visible; }

        /*
         * The activation veil. Transparent to the eye but not to the finger:
         * it takes the tap that wakes the map, and until then every swipe over
         * it is an ordinary page scroll.
         */
        .trackdash-map-veil {
          position: absolute;
          inset: 0;
          z-index: 1100;
          display: none;
          /* Top-centre: the only edge with no Leaflet control, no attribution,
             and no empty-state pill to collide with. */
          align-items: flex-start;
          justify-content: center;
          width: 100%;
          padding: 0.6rem 0 0;
          border: 0;
          font: inherit;
          background: transparent;
          cursor: pointer;
          touch-action: pan-x pan-y;
          -webkit-tap-highlight-color: transparent;
        }
        .trackdash-map-veil.is-visible { display: flex; }
        .trackdash-map-veil::before {
          content: "";
          position: absolute;
          inset: 0 0 auto;
          height: 4.5rem;
          background: linear-gradient(to bottom, rgba(15, 23, 42, .5), transparent);
          pointer-events: none;
        }
        .trackdash-map-veil > span {
          position: relative;
          border-radius: 9999px;
          padding: 0.3rem 0.7rem;
          font-size: 11px;
          font-weight: 700;
          color: #fff;
          background: rgba(15, 23, 42, .78);
        }
      `}</style>
      <div
        ref={containerRef}
        className={className}
        style={{ height, width: "100%" }}
        role="application"
        aria-label="Journey map"
      />
    </>
  );
}
