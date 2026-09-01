"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    /**
     * Whether a worker was already driving this page. If one was, the new
     * worker taking over means the HTML on screen may have come from the old
     * one's cache, so it is worth reloading. On a first install there is no
     * controller and nothing stale — reloading then would be pure churn.
     */
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloading = false;

    const onControllerChange = () => {
      if (!hadController || reloading) return;
      reloading = true;
      // Fresh worker, fresh HTML — this is what unsticks a client that an
      // older cache-first worker had pinned to a page that has since moved.
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange
    );

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        // Pick up SW fixes (e.g. broken offline handlers) promptly after deploy.
        void registration.update();
        // A worker that installed but is waiting behind the old one would
        // otherwise sit there until every tab closes.
        registration.waiting?.postMessage("SKIP_WAITING");
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && registration.waiting) {
              registration.waiting.postMessage("SKIP_WAITING");
            }
          });
        });
      } catch (err) {
        console.warn("SW registration failed", err);
      }
    };

    void register();

    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange
      );
    };
  }, []);

  return null;
}
