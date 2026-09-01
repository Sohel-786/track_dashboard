/**
 * Basemaps. All three are free, keyless raster tile services.
 *
 * Attribution is not decoration here — OpenStreetMap's licence and CARTO's
 * terms both require it to stay visible, and Leaflet renders whatever is set
 * below into the corner of the map. Do not remove it.
 */
export type BasemapId = "streets" | "light" | "dark";

export type Basemap = {
  id: BasemapId;
  label: string;
  url: string;
  attribution: string;
  maxZoom: number;
  /** Applied to the tile layer only, so markers and paths stay full strength. */
  filter?: string;
};

const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export const BASEMAPS: Record<BasemapId, Basemap> = {
  streets: {
    id: "streets",
    label: "Streets",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: OSM_ATTRIBUTION,
    maxZoom: 19,
  },
  light: {
    id: "light",
    label: "Light",
    url: "https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: `${OSM_ATTRIBUTION} &copy; <a href="https://carto.com/attributions">CARTO</a>`,
    maxZoom: 20,
  },
  dark: {
    id: "dark",
    label: "Dark",
    url: "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: `${OSM_ATTRIBUTION} &copy; <a href="https://carto.com/attributions">CARTO</a>`,
    maxZoom: 20,
  },
};

/** Default basemap for a theme — dark tiles on a dark page, light on light. */
export function basemapForTheme(isDark: boolean): BasemapId {
  return isDark ? "dark" : "light";
}

/** Where the map opens before any of this account's own fixes have loaded. */
export const FALLBACK_CENTER = { lat: 23.0225, lng: 72.5714 };
export const FALLBACK_ZOOM = 12;
