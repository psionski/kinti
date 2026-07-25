/**
 * iOS home-screen (standalone) PWAs are cold-started at the manifest
 * `start_url` whenever WebKit evicts them from memory after a period of
 * inactivity — the previous navigation state is lost, so returning to the
 * app dumps you back on the Dashboard instead of the screen you left.
 *
 * To emulate native "resume where you left off", we persist the current
 * route while the app runs and, on a cold start that lands on the start
 * URL, send the user back to it. This module holds the pure, DOM-free
 * decision logic so it can be unit tested; the wiring (localStorage,
 * lifecycle events, router) lives in components/route-memory.tsx.
 */

export const ROUTE_MEMORY_KEY = "kinti:last-route";
export const START_URL = "/";

/**
 * Decide which route to restore on launch, or `null` to stay put.
 *
 * We only restore when the app just cold-started on the bare start URL with
 * no query/hash of its own — the exact state iOS relaunches into. Anything
 * else (a deep entry point, an explicit query) is treated as intentional and
 * left alone. A saved route that is missing, already the start URL, or not an
 * internal path is ignored so we never navigate off-site or loop.
 */
export function pickRestoreRoute(params: {
  pathname: string;
  search: string;
  saved: string | null | undefined;
}): string | null {
  const { pathname, search, saved } = params;
  // Only act on the plain entry point; a deep link or query is intentional.
  if (pathname !== START_URL || search) return null;
  if (!saved || saved === START_URL) return null;
  // Restrict to internal absolute paths — guards against a tampered/protocol
  // value in storage turning into an off-site navigation.
  if (!saved.startsWith("/") || saved.startsWith("//")) return null;
  return saved;
}
