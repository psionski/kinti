"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ROUTE_MEMORY_KEY, isStandalone, pickRestoreRoute } from "@/lib/route-memory";

function currentRoute(): string {
  return window.location.pathname + window.location.search + window.location.hash;
}

/**
 * Saves the standalone PWA's route and restores it after iOS cold-starts the
 * app at the start URL. See lib/route-memory. Restore normally runs flash-free
 * from the layout's inline script; the effect below is an idempotent fallback.
 */
export function RouteMemory(): null {
  const router = useRouter();

  // Fallback restore, on launch.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the route when the app is hidden or torn down — when iOS may evict it.
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
