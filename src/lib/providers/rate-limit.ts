import type { ProviderName } from "./types";
import { financialLogger } from "@/lib/logger";

/**
 * Minimum gap between two outbound requests to the same provider.
 *
 * Free tiers police a per-second burst rate on top of whatever daily quota they
 * advertise, and a sweep that walks assets back-to-back trips the burst limit in
 * milliseconds: the first symbol of a cycle succeeds and every one after it comes
 * back as a rate-limit envelope, which reads in the logs like an exhausted daily
 * quota. 2s clears the tightest burst limit we've been bitten by (Alpha Vantage
 * allows 1 request/second) with margin, and costs nothing on a nightly job.
 *
 * Applied to every provider, not just the metered ones: the free endpoints
 * publish no burst limit at all, which is not the same as not having one.
 */
const DEFAULT_MIN_INTERVAL_MS = 1500;

/**
 * Override for `PROVIDER_MIN_INTERVAL_MS` — 0 disables pacing entirely,
 * which is what a paid key that allows bursts wants. Read per call rather than
 * at module load so tests can vary it without re-importing the module.
 */
function minIntervalMs(): number {
  const raw = process.env.PROVIDER_MIN_INTERVAL_MS;
  if (raw === undefined || raw === "") return DEFAULT_MIN_INTERVAL_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_MIN_INTERVAL_MS;
}

/** A per-provider queue of pending requests. */
interface Lane {
  /** Resolves once the request currently holding the lane has been released. */
  tail: Promise<void>;
  /** Epoch ms at which the last request on this lane was issued. */
  lastSentAt: number;
}

// Providers are re-instantiated on every lookup (see `getProvider`), so the
// pacing state cannot live on the instance. It hangs off `globalThis` for the
// same reason the cron guard does: a dev-mode hot reload re-evaluates the
// module, and a second set of lanes would pace each half of the traffic
// separately while the provider still sees the sum.
const g = globalThis as unknown as { __kintiProviderLanes?: Map<ProviderName, Lane> };
const lanes: Map<ProviderName, Lane> = g.__kintiProviderLanes ?? new Map<ProviderName, Lane>();
g.__kintiProviderLanes = lanes;

function laneFor(provider: ProviderName): Lane {
  let lane = lanes.get(provider);
  if (!lane) {
    lane = { tail: Promise.resolve(), lastSentAt: 0 };
    lanes.set(provider, lane);
  }
  return lane;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for this provider's turn: queue behind every request already waiting on
 * it, then hold until `minIntervalMs` has passed since the previous one was
 * sent.
 *
 * Spacing is measured from when a request is *sent*, not when it completes, so
 * a slow response doesn't push the whole queue back — the limit being respected
 * is a request rate, and requests are free to remain in flight concurrently.
 */
async function acquire(provider: ProviderName): Promise<void> {
  const lane = laneFor(provider);
  const interval = minIntervalMs();

  const turn = lane.tail.then(async () => {
    const wait = lane.lastSentAt + interval - Date.now();
    if (wait > 0) {
      financialLogger.debug({ provider, waitMs: wait }, "Pacing provider request");
      await sleep(wait);
    }
    lane.lastSentAt = Date.now();
  });

  lane.tail = turn;
  await turn;
}

/**
 * `fetch`, paced per provider. Every provider must route its outbound calls
 * through this rather than calling `fetch` directly — a single unpaced call
 * site is enough to re-create the burst, since the limit is enforced on the
 * provider's side across all of our traffic.
 */
export async function providerFetch(
  provider: ProviderName,
  url: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1]
): Promise<Response> {
  await acquire(provider);
  return fetch(url, init);
}
