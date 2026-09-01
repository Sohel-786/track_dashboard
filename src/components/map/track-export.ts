"use client";

/**
 * Client-side track export.
 *
 * The file is built in the browser from data the page already holds, so an
 * export costs nothing on the server and works on whatever is currently on
 * screen. GPX opens in every mapping tool; GeoJSON drops straight into
 * geojson.io or QGIS; CSV is for spreadsheets.
 */

import type { TrackDayResponse } from "@/types";

export type TrackExportFormat = "gpx" | "geojson" | "csv";

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Quote a CSV field only when it needs it, and double any inner quotes. */
function csvCell(value: string | number | null | undefined) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toGpx(day: TrackDayResponse): string {
  const waypoints = day.visits
    .map(
      (visit) =>
        `  <wpt lat="${visit.lat}" lon="${visit.lng}">\n` +
        `    <name>${escapeXml(visit.name)}</name>\n` +
        `    <desc>${escapeXml(
          `${visit.startedAt} to ${visit.endedAt} (${Math.round(
            visit.durationMinutes
          )} min)${visit.isMasjid ? " · masjid" : ""}`
        )}</desc>\n` +
        `    <time>${visit.startedAt}</time>\n` +
        `  </wpt>`
    )
    .join("\n");

  const points = day.path
    .map(
      (point) =>
        `      <trkpt lat="${point.lat}" lon="${point.lng}"><time>${point.ts}</time></trkpt>`
    )
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="TrackDash" xmlns="http://www.topografix.com/GPX/1/1">',
    "  <metadata>",
    `    <name>TrackDash ${escapeXml(day.date)}</name>`,
    `    <time>${day.path[0]?.ts ?? new Date().toISOString()}</time>`,
    "  </metadata>",
    waypoints,
    "  <trk>",
    `    <name>${escapeXml(day.date)}</name>`,
    "    <trkseg>",
    points,
    "    </trkseg>",
    "  </trk>",
    "</gpx>",
  ]
    .filter(Boolean)
    .join("\n");
}

function toGeoJson(day: TrackDayResponse): string {
  return JSON.stringify(
    {
      type: "FeatureCollection",
      features: [
        ...(day.path.length > 1
          ? [
              {
                type: "Feature",
                properties: {
                  name: `Track ${day.date}`,
                  distanceMeters: day.summary.distanceMeters,
                  movingMinutes: day.summary.movingMinutes,
                },
                geometry: {
                  type: "LineString",
                  // GeoJSON is [longitude, latitude] — the reverse of Leaflet.
                  coordinates: day.path.map((point) => [point.lng, point.lat]),
                },
              },
            ]
          : []),
        ...day.visits.map((visit) => ({
          type: "Feature",
          properties: {
            name: visit.name,
            kind: visit.placeKind,
            startedAt: visit.startedAt,
            endedAt: visit.endedAt,
            durationMinutes: visit.durationMinutes,
          },
          geometry: {
            type: "Point",
            coordinates: [visit.lng, visit.lat],
          },
        })),
      ],
    },
    null,
    2
  );
}

function toCsv(day: TrackDayResponse): string {
  const header = [
    "type",
    "name",
    "kind",
    "started_at",
    "ended_at",
    "duration_minutes",
    "latitude",
    "longitude",
  ].join(",");

  const visitRows = day.visits.map((visit) =>
    [
      "visit",
      visit.name,
      visit.placeKind,
      visit.startedAt,
      visit.endedAt,
      Math.round(visit.durationMinutes),
      visit.lat,
      visit.lng,
    ]
      .map(csvCell)
      .join(",")
  );

  const pointRows = day.path.map((point) =>
    ["fix", "", "", point.ts, "", "", point.lat, point.lng]
      .map(csvCell)
      .join(",")
  );

  return [header, ...visitRows, ...pointRows].join("\n");
}

const MIME: Record<TrackExportFormat, string> = {
  gpx: "application/gpx+xml",
  geojson: "application/geo+json",
  csv: "text/csv;charset=utf-8",
};

export function downloadTrack(
  day: TrackDayResponse,
  format: TrackExportFormat
) {
  const body =
    format === "gpx"
      ? toGpx(day)
      : format === "geojson"
        ? toGeoJson(day)
        : toCsv(day);

  const blob = new Blob([body], { type: MIME[format] });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `trackdash-${day.date}.${format}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking immediately can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
