/**
 * iOS evicts a suspended home-screen PWA and cold-starts it at the manifest
 * `start_url` (Dashboard), losing the route the user was on. We persist the
 * route while the app runs and restore it on a cold start.
 *
 * `isStandalone` and `pickRestoreRoute` are kept self-contained — no
 * module-level bindings, only their arguments and the `window` global — so
 * `buildRouteRestoreScript` can serialize them into the pre-hydration inline
 * script instead of duplicating the logic. Don't add external references.
 */

export const ROUTE_MEMORY_KEY = "kinti:last-route";

/** True when running as an installed/home-screen PWA (iOS `navigator.standalone` or the display-mode query). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches
  );
}

/**
 * The route to restore on launch, or `null` to stay put. Only restores when
 * cold-started on the bare start URL (the state iOS relaunches into); a deep
 * entry point or explicit query is left alone, and a saved route must be an
 * internal absolute path so a tampered value can't send us off-site.
 */
export function pickRestoreRoute(params: {
  pathname: string;
  search: string;
  saved: string | null | undefined;
}): string | null {
  const pathname = params.pathname;
  const search = params.search;
  const saved = params.saved;
  if (pathname !== "/" || search) return null;
  if (!saved || saved === "/") return null;
  if (saved.charAt(0) !== "/" || saved.charAt(1) === "/") return null;
  return saved;
}

/** Serialize a function for inlining, rejecting `</` which could close the `<script>` early. */
function serializeFn(fn: (...args: never[]) => unknown): string {
  const src = fn.toString();
  if (src.includes("</")) {
    throw new Error(`route-memory: refusing to inline function source containing "</": ${fn.name}`);
  }
  return src;
}

/**
 * The inline script for a zero-flash restore: it runs during initial HTML parse,
 * before hydration, so a relaunched PWA jumps to the remembered route without a
 * Dashboard flash. Serializes the functions above rather than reimplementing them.
 */
export function buildRouteRestoreScript(): string {
  const key = JSON.stringify(ROUTE_MEMORY_KEY);
  return (
    `(function(){try{` +
    `var isStandalone=${serializeFn(isStandalone)};` +
    `var pickRestoreRoute=${serializeFn(pickRestoreRoute)};` +
    `if(!isStandalone())return;` +
    `var l=window.location;` +
    `var target=pickRestoreRoute({pathname:l.pathname,search:l.search,saved:window.localStorage.getItem(${key})});` +
    `if(target)l.replace(target);` +
    `}catch(e){}})();`
  );
}
