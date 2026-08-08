"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        // Pick up SW fixes (e.g. broken offline handlers) promptly after deploy.
        void registration.update();
      } catch (err) {
        console.warn("SW registration failed", err);
      }
    };

    void register();
  }, []);

  return null;
}
