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
}: TrackMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const overlayRef = useRef<L.LayerGroup | null>(null);
  const fittedKeyRef = useRef<string | null>(null);

  /* -------------------------------------------------------------- create */

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [FALLBACK_CENTER.lat, FALLBACK_CENTER.lng],
      zoom: FALLBACK_ZOOM,
      zoomControl: true,
      attributionControl: true,
      // Scroll should pan the page until the map is deliberately clicked into.
      scrollWheelZoom: false,
    });

    map.on("click", () => map.scrollWheelZoom.enable());
    map.on("mouseout", () => map.scrollWheelZoom.disable());

    L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);
    overlayRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    /**
     * Leaflet measures its container once. Inside a tab panel that container is
     * zero-height until the tab is shown, which leaves the map a grey box —
     * re-measuring on resize is what makes it survive tab switches and rotation.
     */
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
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
    map.setView([center.lat, center.lng], zoom ?? map.getZoom(), {
      animate: true,
    });
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
        }
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
