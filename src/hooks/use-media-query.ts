"use client";

import { useEffect, useState } from "react";

/** Subscribes to a CSS media query (matches Tailwind breakpoints). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [query]);

  return matches;
}

/** True when viewport is below Tailwind `lg` (1024px). */
export function useIsBelowLg() {
  return useMediaQuery("(max-width: 1023px)");
}
