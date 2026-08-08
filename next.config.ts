import type { NextConfig } from "next";
import { assertRequiredEnvForBuild } from "./src/lib/env";

// Fail Vercel/production builds when AUTH_SECRET or MONGODB_URI are missing
// instead of shipping a broken login experience.
assertRequiredEnvForBuild();

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  headers: async () => [
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
