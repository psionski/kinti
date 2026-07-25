"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ROUTE_MEMORY_KEY, pickRestoreRoute } from "@/lib/route-memory";

/**
 * True when the app is running as an installed/home-screen PWA (iOS's legacy
 * `navigator.standalone` flag, or the standard `display-mode` media query used
 * by Android/desktop). We only touch navigation in that mode — a normal
 * browser tab already restores its own state, so interfering would be wrong.
 */
function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  const iosStandalone = nav.standalone === true;
  const displayStandalone =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;
  return iosStandalone || displayStandalone;
}

function currentRoute(): string {
  return window.location.pathname + window.location.search + window.location.hash;
}

/**
 * Remembers the last route of the standalone (home-screen) PWA and restores it
 * after iOS cold-starts the app at the manifest start URL. See lib/route-memory
 * for the rationale and the pure decision logic.
 */
export function RouteMemory(): null {
  const router = useRouter();

  // Restore once, on launch. If iOS relaunched us on the start URL and we have
  // a remembered route, hop straight back to it.
  useEffect(() => {
    if (!isStandalone()) return;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(ROUTE_MEMORY_KEY);
    } catch {
      return; // storage blocked (e.g. private mode) — nothing to restore
    }
    const target = pickRestoreRoute({
      pathname: window.location.pathname,
      search: window.location.search,
      saved,
    });
    if (target) router.replace(target);
    // Launch-only: later navigations are captured by the save effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the live route whenever the app is hidden or torn down — the moment
  // iOS may suspend and later evict it. The handler reads the location at event
  // time, so it always records where the user actually is.
  useEffect(() => {
    if (!isStandalone()) return;
    const save = (): void => {
      try {
        localStorage.setItem(ROUTE_MEMORY_KEY, currentRoute());
      } catch {
        /* storage blocked — best effort, ignore */
      }
    };
    const onVisibilityChange = (): void => {
      if (document.visibilityState === "hidden") save();
    };
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return null;
}
