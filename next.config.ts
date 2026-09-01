import type { NextConfig } from "next";
import { assertRequiredEnvForBuild } from "./src/lib/env";

// Fail Vercel/production builds when AUTH_SECRET or MONGODB_URI are missing
// instead of shipping a broken login experience.
assertRequiredEnvForBuild();

const isProd = process.env.NODE_ENV === "production";

/**
 * Map tile hosts.
 *
 * These are the *only* third-party origins the app talks to, they are reached
 * as images and nothing else, and none of them can run code here — `script-src`
 * stays locked to `'self'`, so Leaflet is bundled rather than pulled from a CDN.
 * OpenStreetMap's and CARTO's tile services are free and keyless, which is why
 * the map needs no paid provider.
 */
const tileHosts = [
  "https://tile.openstreetmap.org",
  "https://*.tile.openstreetmap.org",
  "https://*.basemaps.cartocdn.com",
];

/**
 * `'unsafe-inline'` for styles is required by Tailwind's inline style attributes
 * and Recharts' generated styles; `'unsafe-eval'` is dev-only (React Refresh).
 * Everything else is locked to this origin — no third-party script, frame or
 * form target can load, and the page can never be framed.
 *
 * `connect-src` stays `'self'`: OpenStreetMap's search endpoints are called
 * from the server (see lib/osm.ts), never from the browser, so no XHR ever
 * leaves this origin.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  `img-src 'self' data: blob: ${tileHosts.join(" ")}`,
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(isProd ? ["upgrade-insecure-requests"] : []),
].join("; ");

/**
 * `geolocation=(self)` — the app's own pages may ask for a position, and only
 * after the user turns tracking on and the browser grants permission. Every
 * other powerful feature stays denied outright.
 */
const permissionsPolicy =
  "camera=(), microphone=(), geolocation=(self), payment=(), usb=(), interest-cohort=()";

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: permissionsPolicy },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    root: process.cwd(),
  },
  headers: async () => [
    {
      source: "/:path*",
      headers: securityHeaders,
    },
    {
      // Authenticated JSON must never be stored by a shared cache or the SW.
      source: "/api/:path*",
      headers: [
        {
          key: "Cache-Control",
          value: "no-store, no-cache, must-revalidate, max-age=0",
        },
      ],
    },
    {
      source: "/sw.js",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=0, must-revalidate",
        },
        {
          key: "Service-Worker-Allowed",
          value: "/",
        },
      ],
    },
    {
      source: "/manifest.webmanifest",
      headers: [
        {
          key: "Content-Type",
          value: "application/manifest+json",
        },
      ],
    },
  ],
};

export default nextConfig;
